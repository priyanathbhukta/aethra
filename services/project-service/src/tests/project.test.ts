// ==============================================================================
// AETHRA Project Service — EPC Milestones & Handover Lifecycle Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import { ProjectApplicationService } from '../application/project.service.js';

test('Project Management Service — EPC Milestones, Progress Projection & Handover', async (t) => {
  await t.test('Scenario 1: Creates EPC project, generates 6 standard milestones, and emits project.created.v1', async () => {
    let createdProject: any = null;
    const createdMilestones: any[] = [];
    const outboxEvents: any[] = [];

    const mockDb: any = {
      transaction: () => ({
        execute: async (fn: any) => {
          const trxMock = {
            insertInto: (table: string) => ({
              values: (vals: any) => {
                if (table === 'projects') createdProject = vals;
                if (table === 'milestones') createdMilestones.push(vals);
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

    const service = new ProjectApplicationService(mockDb);
    const result = await service.createProject({
      organisationId: 'vendor-sunvolt-01',
      projectName: 'Sharma Residence 5kW Solar Rooftop',
      customerId: 'cust-sharma-99',
      propertyId: 'prop-sharma-01',
      capacityKw: 5.0,
      plannedStartDate: '2026-11-20T00:00:00Z',
      plannedCompletionDate: '2026-12-20T00:00:00Z',
      siteContactName: 'Rajesh Sharma',
      siteContactPhone: '+919876543210',
      siteAddress: '142 Indiranagar, Bangalore',
      projectManagerUserId: 'usr-pm-arun',
      correlationId: 'corr-prj-101',
    });

    assert.ok(result);
    assert.ok(createdProject);
    assert.strictEqual(result.project.status, 'initiated');
    assert.match(result.project.project_code, /^PRJ-\d{4}-\d{4}$/);
    assert.strictEqual(createdMilestones.length, 6);

    // Sum of milestone weightages must equal 100%
    const totalWeight = createdMilestones.reduce((acc, m) => acc + Number(m.weightage_percent), 0);
    assert.strictEqual(totalWeight, 100);

    // Outbox event
    assert.strictEqual(outboxEvents.length, 1);
    assert.strictEqual(outboxEvents[0].event_type, 'project.created.v1');
    assert.strictEqual(outboxEvents[0].payload.data.capacityKw, 5.0);
    assert.strictEqual(outboxEvents[0].payload.data.projectManagerUserId, 'usr-pm-arun');
  });

  await t.test('Scenario 2: Completing milestone updates progress percentage and emits milestone event', async () => {
    const milestone1 = {
      id: 'ms-001',
      project_id: 'prj-001',
      milestone_name: 'Site Survey & Engineering Design',
      sequence_order: 1,
      status: 'pending',
      weightage_percent: 15.0,
    };

    const milestone2 = {
      id: 'ms-002',
      project_id: 'prj-001',
      milestone_name: 'Procurement & Material Delivery',
      sequence_order: 2,
      status: 'pending',
      weightage_percent: 25.0,
    };

    const outboxEvents: any[] = [];
    let updatedCustomerView: any = null;

    const mockDb: any = {
      transaction: () => ({
        execute: async (fn: any) => {
          const trxMock = {
            updateTable: (table: string) => ({
              set: (updates: any) => ({
                where: () => ({
                  where: () => ({
                    where: () => ({
                      returningAll: () => ({
                        executeTakeFirstOrThrow: async () => ({ ...milestone1, ...updates }),
                      }),
                    }),
                  }),
                  execute: async () => {
                    if (table === 'customer_progress_views') updatedCustomerView = updates;
                  },
                }),
              }),
            }),
            selectFrom: () => ({
              selectAll: () => ({
                where: () => ({
                  orderBy: () => ({
                    execute: async () => [
                      { ...milestone1, status: 'completed' },
                      milestone2,
                    ],
                  }),
                }),
              }),
            }),
            insertInto: () => ({
              values: (vals: any) => {
                outboxEvents.push(vals);
                return { execute: async () => {} };
              },
            }),
          };
          return fn(trxMock);
        },
      }),
    };

    const service = new ProjectApplicationService(mockDb);
    const result = await service.updateMilestone({
      organisationId: 'vendor-sunvolt-01',
      projectId: 'prj-001',
      milestoneId: 'ms-001',
      status: 'completed',
      correlationId: 'corr-ms-101',
    });

    assert.ok(result);
    assert.strictEqual(result.overallProgressPercentage, 15.0);
    assert.ok(updatedCustomerView);
    assert.strictEqual(updatedCustomerView.overall_progress_percentage, 15.0);
    assert.strictEqual(outboxEvents.length, 1);
    assert.strictEqual(outboxEvents[0].event_type, 'project.milestone.published.v1');
    assert.strictEqual(outboxEvents[0].payload.data.overallProgressPercentage, 15.0);
  });

  await t.test('Scenario 3: Handover completion marks project complete and emits project.handover.completed.v1', async () => {
    const projectRecord = {
      id: 'prj-001',
      organisation_id: 'vendor-sunvolt-01',
      customer_id: 'cust-sharma-99',
      property_id: 'prop-sharma-01',
      capacity_kw: 5.0,
      status: 'commissioned',
    };

    const outboxEvents: any[] = [];
    let updatedCustomerView: any = null;

    const mockDb: any = {
      selectFrom: () => ({
        selectAll: () => ({
          where: () => ({
            where: () => ({
              executeTakeFirst: async () => projectRecord,
            }),
          }),
        }),
      }),
      transaction: () => ({
        execute: async (fn: any) => {
          const trxMock = {
            insertInto: (table: string) => ({
              values: (vals: any) => {
                if (table === 'outbox_events') outboxEvents.push(vals);
                return {
                  returningAll: () => ({
                    executeTakeFirstOrThrow: async () => vals,
                  }),
                  execute: async () => {},
                };
              },
            }),
            updateTable: (table: string) => ({
              set: (updates: any) => ({
                where: () => ({
                  execute: async () => {
                    if (table === 'customer_progress_views') updatedCustomerView = updates;
                  },
                }),
              }),
            }),
          };
          return fn(trxMock);
        },
      }),
    };

    const service = new ProjectApplicationService(mockDb);
    const handover = await service.completeHandover({
      organisationId: 'vendor-sunvolt-01',
      projectId: 'prj-001',
      handoverDate: '2026-12-15T00:00:00Z',
      commissioningReportDocId: 'doc-comm-cert-pdf',
      warrantyPackDocId: 'doc-warranty-pdf',
      discomInspectionLetterDocId: 'doc-discom-ceig-pdf',
      signedOffByUserId: 'usr-pm-arun',
      correlationId: 'corr-handover-101',
    });

    assert.ok(handover);
    assert.strictEqual(handover.handover_status, 'pending_customer_signature');
    assert.strictEqual(updatedCustomerView.overall_progress_percentage, 100.0);
    assert.strictEqual(updatedCustomerView.current_phase_display, 'Handover Complete & Operational');

    assert.strictEqual(outboxEvents.length, 1);
    assert.strictEqual(outboxEvents[0].event_type, 'project.handover.completed.v1');
    assert.strictEqual(outboxEvents[0].payload.data.capacityKw, 5.0);
    assert.strictEqual(outboxEvents[0].payload.data.commissioningReportDocId, 'doc-comm-cert-pdf');
  });

  await t.test('Scenario 4: Customer progress view projection returns sanitized view for customer portal', async () => {
    const mockProgressView = {
      id: 'cpv-001',
      project_id: 'prj-001',
      customer_id: 'cust-sharma-99',
      property_id: 'prop-sharma-01',
      overall_progress_percentage: 65.0,
      current_phase_display: 'Inverter, Cabling & Electrical Works',
      published_milestones: [
        { milestoneName: 'Site Survey & Engineering Design', status: 'completed' },
        { milestoneName: 'Procurement & Material Delivery', status: 'completed' },
        { milestoneName: 'Mounting Structure & Module Installation', status: 'completed' },
        { milestoneName: 'Inverter, Cabling & Electrical Works', status: 'in_progress' },
      ],
    };

    const mockDb: any = {
      selectFrom: () => ({
        selectAll: () => ({
          where: () => ({
            where: () => ({
              executeTakeFirst: async () => mockProgressView,
            }),
          }),
        }),
      }),
    };

    const service = new ProjectApplicationService(mockDb);
    const view = await service.getCustomerProgressView('cust-sharma-99', 'prj-001');

    assert.ok(view);
    assert.strictEqual(view.overall_progress_percentage, 65.0);
    assert.strictEqual(view.current_phase_display, 'Inverter, Cabling & Electrical Works');
    assert.strictEqual(view.published_milestones.length, 4);
  });
});
