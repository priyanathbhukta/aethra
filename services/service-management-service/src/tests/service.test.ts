// ==============================================================================
// AETHRA Service Management — AMC, Ticketing & Field Visit Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import { ServiceManagementApplicationService } from '../application/service-management.service.js';

test('Service Management Service — AMC Contracts, Tickets & Technician Visits', async (t) => {
  await t.test('Scenario 1: Provisions AMC contract and validates contract tier and visit quotas', async () => {
    let createdAmc: any = null;

    const mockDb: any = {
      insertInto: () => ({
        values: (vals: any) => {
          createdAmc = vals;
          return {
            returningAll: () => ({
              executeTakeFirstOrThrow: async () => vals,
            }),
          };
        },
      }),
    };

    const service = new ServiceManagementApplicationService(mockDb);
    const amc = await service.createAmcContract({
      organisationId: 'vendor-sunvolt-01',
      customerId: 'cust-sharma-99',
      propertyId: 'prop-sharma-01',
      installationId: 'inst-sharma-5kw',
      contractTier: 'comprehensive',
      visitsPerYear: 4,
      contractAmount: 18000,
      startDate: '2026-12-01T00:00:00Z',
      endDate: '2027-11-30T00:00:00Z',
    });

    assert.ok(amc);
    assert.strictEqual(amc.contract_tier, 'comprehensive');
    assert.strictEqual(amc.visits_per_year, 4);
    assert.match(amc.amc_code, /^AMC-\d{4}-\d{4}$/);
    assert.strictEqual(createdAmc.contract_amount, 18000);
  });

  await t.test('Scenario 2: Logs service ticket and dispatches service.ticket.created.v1 outbox event', async () => {
    let createdTicket: any = null;
    const ticketEvents: any[] = [];
    const outboxEvents: any[] = [];

    const mockDb: any = {
      transaction: () => ({
        execute: async (fn: any) => {
          const trxMock = {
            insertInto: (table: string) => ({
              values: (vals: any) => {
                if (table === 'service_tickets') createdTicket = vals;
                if (table === 'ticket_events') ticketEvents.push(vals);
                if (table === 'outbox_events') outboxEvents.push(vals);
                return {
                  returningAll: () => ({
                    executeTakeFirstOrThrow: async () => vals,
                  }),
                  execute: async () => {},
                };
              },
            }),
          };
          return fn(trxMock);
        },
      }),
    };

    const service = new ServiceManagementApplicationService(mockDb);
    const ticket = await service.createServiceTicket({
      organisationId: 'vendor-sunvolt-01',
      customerId: 'cust-sharma-99',
      propertyId: 'prop-sharma-01',
      installationId: 'inst-sharma-5kw',
      ticketType: 'inverter_failure',
      priority: 'high',
      customerReportedIssue: 'Inverter error code E031: Grid overvoltage detected',
      createdByUserId: 'usr-support-agent',
      correlationId: 'corr-tkt-101',
    });

    assert.ok(ticket);
    assert.strictEqual(ticket.status, 'open');
    assert.strictEqual(ticket.priority, 'high');
    assert.match(ticket.ticket_number, /^TKT-\d{4}-\d{4}$/);

    assert.strictEqual(ticketEvents.length, 1);
    assert.strictEqual(ticketEvents[0].is_customer_visible, true);

    assert.strictEqual(outboxEvents.length, 1);
    assert.strictEqual(outboxEvents[0].event_type, 'service.ticket.created.v1');
    assert.strictEqual(outboxEvents[0].payload.data.ticketType, 'inverter_failure');
    assert.ok(createdTicket);
  });

  await t.test('Scenario 3: Assigns technician and transitions ticket status to assigned', async () => {
    let assignmentRecord: any = null;
    let updatedTicketStatus: any = null;

    const mockDb: any = {
      transaction: () => ({
        execute: async (fn: any) => {
          const trxMock = {
            insertInto: (table: string) => ({
              values: (vals: any) => {
                if (table === 'service_assignments') assignmentRecord = vals;
                return {
                  returningAll: () => ({
                    executeTakeFirstOrThrow: async () => vals,
                  }),
                  execute: async () => {},
                };
              },
            }),
            updateTable: () => ({
              set: (updates: any) => ({
                where: () => ({
                  where: () => ({
                    execute: async () => {
                      updatedTicketStatus = updates.status;
                    },
                  }),
                }),
              }),
            }),
          };
          return fn(trxMock);
        },
      }),
    };

    const service = new ServiceManagementApplicationService(mockDb);
    const assignment = await service.assignTechnician({
      organisationId: 'vendor-sunvolt-01',
      ticketId: 'tkt-001',
      technicianUserId: 'usr-tech-ramesh',
      scheduledAt: '2026-11-22T10:00:00Z',
      assignedByUserId: 'usr-dispatcher-01',
    });

    assert.ok(assignment);
    assert.strictEqual(assignment.technician_user_id, 'usr-tech-ramesh');
    assert.strictEqual(updatedTicketStatus, 'assigned');
    assert.ok(assignmentRecord);
  });

  await t.test('Scenario 4: Records service visit, replaces spare part with serial tracking, and marks ticket resolved', async () => {
    let visitRecord: any = null;
    const partsUsedList: any[] = [];
    let updatedTicketStatus: any = null;

    const mockDb: any = {
      transaction: () => ({
        execute: async (fn: any) => {
          const trxMock = {
            insertInto: (table: string) => ({
              values: (vals: any) => {
                if (table === 'service_visits') visitRecord = vals;
                if (table === 'parts_used') partsUsedList.push(vals);
                return {
                  returningAll: () => ({
                    executeTakeFirstOrThrow: async () => vals,
                  }),
                  execute: async () => {},
                };
              },
            }),
            updateTable: () => ({
              set: (updates: any) => ({
                where: () => ({
                  where: () => ({
                    execute: async () => {
                      updatedTicketStatus = updates.status;
                    },
                  }),
                }),
              }),
            }),
          };
          return fn(trxMock);
        },
      }),
    };

    const service = new ServiceManagementApplicationService(mockDb);
    const visit = await service.recordServiceVisit({
      organisationId: 'vendor-sunvolt-01',
      ticketId: 'tkt-001',
      assignmentId: 'assign-001',
      arrivalTime: '2026-11-22T10:30:00Z',
      departureTime: '2026-11-22T12:00:00Z',
      siteObservations: 'Grid surge damaged internal SPD module in 5kW inverter',
      rootCause: 'Lightning strike adjacent to DISCOM feeder line',
      correctiveAction: 'Replaced AC Surge Protection Device (SPD Type II) and tested net-generation',
      customerSignoffName: 'Rajesh Sharma',
      partsUsed: [
        {
          catalogueProductId: 'prod-spd-ac-40ka',
          itemName: 'Schneider AC SPD Type II 40kA',
          quantity: 1,
          serialNumberRemoved: 'SPD-OLD-1102',
          serialNumberInstalled: 'SPD-NEW-9941',
          warrantyStatus: 'covered_under_warranty',
          billedAmount: 0,
        },
      ],
    });

    assert.ok(visit);
    assert.strictEqual(updatedTicketStatus, 'resolved');
    assert.strictEqual(partsUsedList.length, 1);
    assert.strictEqual(partsUsedList[0].serial_number_installed, 'SPD-NEW-9941');
    assert.strictEqual(partsUsedList[0].warranty_status, 'covered_under_warranty');
    assert.ok(visitRecord);
  });
});
