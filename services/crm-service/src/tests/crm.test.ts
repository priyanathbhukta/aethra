// ==============================================================================
// AETHRA CRM Service — Unit & Pipeline Security Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import { CrmApplicationService } from '../application/crm.service.js';

test('CRM Service — Tenant Isolation & Lead Lifecycle', async (t) => {
  await t.test('Scenario 1: Creates new lead with auto-generated lead code and activity log', async () => {
    const insertedRecords: Record<string, any[]> = {
      leads: [],
      lead_activities: [],
      lead_stages: [],
    };

    const mockDb: any = {
      selectFrom: (table: string) => ({
        selectAll: () => ({
          where: (_c: string, _o: string, _v: any) => ({
            where: () => ({
              executeTakeFirst: async () => null, // No duplicate
            }),
            orderBy: () => ({
              executeTakeFirst: async () => {
                if (table === 'lead_stages') {
                  return { id: 'st-new', name: 'New Lead', stage_order: 1 };
                }
                return null;
              },
            }),
          }),
        }),
      }),
      transaction: () => ({
        execute: async (fn: any) => {
          const trxMock = {
            insertInto: (table: string) => ({
              values: (vals: any) => {
                insertedRecords[table].push(vals);
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

    const service = new CrmApplicationService(mockDb);
    const lead = await service.createLead({
      organisationId: 'org-vendor-sunvolt',
      prospectName: 'Kavita Patel',
      prospectPhone: '+919988776655',
      prospectEmail: 'kavita@pateltextiles.com',
      prospectType: 'commercial',
      proposedCapacityKw: 25.0,
      siteCity: 'Ahmedabad',
      correlationId: 'corr-crm-01',
    });

    assert.ok(lead);
    assert.strictEqual(lead.prospect_name, 'Kavita Patel');
    assert.match(lead.lead_code, /^LD-\d{4}-\d{4}$/);
    assert.strictEqual(insertedRecords.leads.length, 1);
    assert.strictEqual(insertedRecords.lead_activities.length, 1);
  });

  await t.test('Scenario 2: Prevents duplicate prospect phone within same organisation', async () => {
    const mockDb: any = {
      selectFrom: () => ({
        selectAll: () => ({
          where: () => ({
            where: () => ({
              executeTakeFirst: async () => ({
                id: 'lead-1',
                lead_code: 'LD-2026-1234',
                prospect_phone: '+919988776655',
              }),
            }),
          }),
        }),
      }),
    };

    const service = new CrmApplicationService(mockDb);
    await assert.rejects(
      async () => {
        await service.createLead({
          organisationId: 'org-vendor-sunvolt',
          prospectName: 'Kavita Patel',
          prospectPhone: '+919988776655',
          correlationId: 'corr-crm-dup',
        });
      },
      /CONFLICT.*already exists/
    );
  });

  await t.test('Scenario 3: Assigns sales agent and records assignment', async () => {
    let updatedAgent: any = null;
    const insertedAssignments: any[] = [];

    const mockDb: any = {
      transaction: () => ({
        execute: async (fn: any) => {
          const trxMock = {
            insertInto: () => ({
              values: (vals: any) => {
                insertedAssignments.push(vals);
                return { execute: async () => {} };
              },
            }),
            updateTable: () => ({
              set: (vals: any) => ({
                where: () => ({
                  where: () => ({
                    returningAll: () => ({
                      executeTakeFirstOrThrow: async () => {
                        updatedAgent = vals.assigned_agent_user_id;
                        return { id: 'lead-1', assigned_agent_user_id: vals.assigned_agent_user_id };
                      },
                    }),
                  }),
                }),
              }),
            }),
          };
          return fn(trxMock);
        },
      }),
    };

    const service = new CrmApplicationService(mockDb);
    const result = await service.assignLead({
      organisationId: 'org-vendor-sunvolt',
      leadId: 'lead-1',
      assignedToUserId: 'agent-rahul-42',
      assignedByUserId: 'mgr-vikram-01',
    });

    assert.ok(result);
    assert.strictEqual(updatedAgent, 'agent-rahul-42');
    assert.strictEqual(insertedAssignments.length, 1);
  });

  await t.test('Scenario 4: Converts lead and dispatches crm.lead.converted.v1 outbox event', async () => {
    const insertedRecords: Record<string, any[]> = {
      lead_conversions: [],
      outbox_events: [],
    };

    const mockDb: any = {
      selectFrom: () => ({
        selectAll: () => ({
          where: () => ({
            where: () => ({
              executeTakeFirst: async () => ({
                id: 'lead-con-99',
                lead_code: 'LD-2026-9999',
                prospect_name: 'Aditya Birla Solar Site',
                prospect_phone: '+919876501234',
                prospect_email: 'solar@adityabirla.com',
              }),
            }),
          }),
        }),
      }),
      transaction: () => ({
        execute: async (fn: any) => {
          const trxMock = {
            insertInto: (table: string) => ({
              values: (vals: any) => {
                insertedRecords[table].push(vals);
                return {
                  returningAll: () => ({
                    executeTakeFirstOrThrow: async () => vals,
                  }),
                  execute: async () => {},
                };
              },
            }),
            updateTable: () => ({
              set: () => ({
                where: () => ({
                  execute: async () => {},
                }),
              }),
            }),
          };
          return fn(trxMock);
        },
      }),
    };

    const service = new CrmApplicationService(mockDb);
    const conversion = await service.convertLead({
      organisationId: 'org-vendor-sunvolt',
      leadId: 'lead-con-99',
      customerId: 'cust-new-id',
      quotationId: 'quot-draft-id',
      convertedByUserId: 'agent-rahul-42',
      correlationId: 'corr-conv-888',
    });

    assert.ok(conversion);
    assert.strictEqual(insertedRecords.lead_conversions.length, 1);
    assert.strictEqual(insertedRecords.outbox_events.length, 1);

    const outbox = insertedRecords.outbox_events[0];
    assert.strictEqual(outbox.event_type, 'crm.lead.converted.v1');
    assert.strictEqual(outbox.payload.data.leadCode, 'LD-2026-9999');
    assert.strictEqual(outbox.correlation_id, 'corr-conv-888');
  });
});
