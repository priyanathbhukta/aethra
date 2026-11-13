// ==============================================================================
// AETHRA Reporting Service — Read Projections & Export Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import { ReportingApplicationService } from '../application/reporting.service.js';

test('Reporting & Analytics Service — Read Projections & Async Exports', async (t) => {
  await t.test('Scenario 1: Fetches aggregated read model without transactional table contention', async () => {
    const projectionRecord = {
      id: 'proj-001',
      organisation_id: 'vendor-sunvolt-01',
      projection_type: 'monthly_sales',
      aggregated_metrics: {
        totalRevenue: 4500000,
        dealsClosed: 18,
        totalKwpInstalled: 180.5,
      },
      last_updated_at: new Date(),
    };

    const mockDb: any = {
      selectFrom: () => ({
        selectAll: () => ({
          where: () => ({
            where: () => ({
              orderBy: () => ({
                executeTakeFirst: async () => projectionRecord,
              }),
            }),
          }),
        }),
      }),
    };

    const service = new ReportingApplicationService(mockDb);
    const result: any = await service.getReportProjection('vendor-sunvolt-01', 'monthly_sales');

    assert.ok(result);
    assert.strictEqual(result.projection_type, 'monthly_sales');
    assert.strictEqual(result.aggregated_metrics.totalRevenue, 4500000);
    assert.strictEqual(result.aggregated_metrics.dealsClosed, 18);
  });

  await t.test('Scenario 2: Upserts monthly rollup metrics into read projection', async () => {
    let savedProjection: any = null;

    const mockDb: any = {
      selectFrom: () => ({
        selectAll: () => ({
          where: () => ({
            where: () => ({
              where: () => ({
                where: () => ({
                  executeTakeFirst: async () => null, // insert new
                }),
              }),
            }),
          }),
        }),
      }),
      insertInto: () => ({
        values: (vals: any) => {
          savedProjection = vals;
          return {
            returningAll: () => ({
              executeTakeFirstOrThrow: async () => vals,
            }),
          };
        },
      }),
    };

    const service = new ReportingApplicationService(mockDb);
    const result = await service.upsertProjection(
      'vendor-sunvolt-01',
      'quarterly_installations',
      { kwp: 500, projects: 25 },
      new Date('2026-01-01'),
      new Date('2026-03-31')
    );

    assert.ok(result);
    assert.strictEqual(result.projection_type, 'quarterly_installations');
    assert.strictEqual(savedProjection.aggregated_metrics.kwp, 500);
  });

  await t.test('Scenario 3: Enqueues and completes async CSV export job', async () => {
    const reportDef = {
      id: 'rep-001',
      report_code: 'sales_conversion_funnel',
      name: 'Sales Funnel',
    };

    let createdJob: any = null;

    const mockDb: any = {
      selectFrom: () => ({
        selectAll: () => ({
          where: () => ({
            executeTakeFirst: async () => reportDef,
          }),
        }),
      }),
      insertInto: () => ({
        values: (vals: any) => {
          createdJob = vals;
          return {
            returningAll: () => ({
              executeTakeFirstOrThrow: async () => vals,
            }),
          };
        },
      }),
    };

    const service = new ReportingApplicationService(mockDb);
    const job = await service.enqueueExportJob({
      organisationId: 'vendor-sunvolt-01',
      reportCode: 'sales_conversion_funnel',
      requestedByUserId: 'usr-analyst-01',
      exportFormat: 'csv',
    });

    assert.ok(job);
    assert.strictEqual(job.status, 'completed');
    assert.strictEqual(job.export_format, 'csv');
    assert.ok(job.download_file_id);
    assert.ok(job.download_file_id.endsWith('.csv'));
    assert.ok(createdJob);
  });
});
