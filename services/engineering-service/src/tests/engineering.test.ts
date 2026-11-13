// ==============================================================================
// AETHRA Engineering Service — Deterministic Sizing & BOM Unit Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import { EngineeringApplicationService } from '../application/engineering.service.js';

test('Engineering Service — Solar PV Sizing & Automated BOM Generation', async (t) => {
  await t.test('Scenario 1: Computes solar capacity bounded by usable area and sanctioned load', async () => {
    const insertedRecords: Record<string, any[]> = {
      engineering_estimates: [],
      engineering_inputs: [],
      calculation_outputs: [],
      calculation_assumptions: [],
      bill_of_materials: [],
      bom_versions: [],
      bom_items: [],
      outbox_events: [],
    };

    const mockDb: any = {
      selectFrom: () => ({
        innerJoin: () => ({
          select: () => ({
            where: () => ({
              where: () => ({
                executeTakeFirst: async () => ({
                  profile_id: 'prof-mnre',
                  version_id: 'ver-1',
                  formula_definitions: {},
                }),
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
          };
          return fn(trxMock);
        },
      }),
    };

    const service = new EngineeringApplicationService(mockDb);
    // Sanction load = 10 kW, Usable area = 80 sqm -> Area capacity = 80 / 10 = 8.0 kWp -> Bound is 8.0 kWp
    const result = await service.runEstimate({
      organisationId: 'vendor-sunvolt-01',
      sanctionLoadKw: 10.0,
      usableAreaSqm: 80.0,
      calculatedByUserId: 'eng-anil-23',
      correlationId: 'corr-eng-100',
    });

    assert.ok(result);
    assert.strictEqual(result.estimate.status, 'calculated');

    // Outputs verification
    const capOutput = result.outputs.find((o) => o.key === 'recommended_capacity_kw');
    assert.strictEqual(capOutput?.value, 8.0);

    const genOutput = result.outputs.find((o) => o.key === 'annual_generation_kwh');
    // 8.0 kWp * 1500 * 0.78 = 9360 kWh/yr
    assert.strictEqual(genOutput?.value, 9360);

    // BOM items verification
    assert.strictEqual(result.bom.items.length, 5);
    const moduleItem = result.bom.items.find((i) => i.category === 'solar_module');
    // Math.ceil((8.0 * 1000) / 550) = 15 modules
    assert.strictEqual(moduleItem?.qty, 15);

    // Outbox events
    assert.strictEqual(insertedRecords.outbox_events.length, 2);
    const estimateEvent = insertedRecords.outbox_events.find((e) => e.event_type === 'engineering.estimate.completed.v1');
    assert.ok(estimateEvent);
    assert.strictEqual(estimateEvent.payload.data.recommendedCapacityKw, 8.0);

    const bomEvent = insertedRecords.outbox_events.find((e) => e.event_type === 'engineering.bom.generated.v1');
    assert.ok(bomEvent);
    assert.strictEqual(bomEvent.payload.data.itemCount, 5);
  });

  await t.test('Scenario 2: Sanction load bounds capacity when roof area is oversized', async () => {
    const insertedRecords: Record<string, any[]> = {
      engineering_estimates: [],
      engineering_inputs: [],
      calculation_outputs: [],
      calculation_assumptions: [],
      bill_of_materials: [],
      bom_versions: [],
      bom_items: [],
      outbox_events: [],
    };

    const mockDb: any = {
      selectFrom: () => ({
        innerJoin: () => ({
          select: () => ({
            where: () => ({
              where: () => ({
                executeTakeFirst: async () => ({
                  profile_id: 'prof-mnre',
                  version_id: 'ver-1',
                  formula_definitions: {},
                }),
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
          };
          return fn(trxMock);
        },
      }),
    };

    const service = new EngineeringApplicationService(mockDb);
    // Sanction load = 5 kW, Usable area = 150 sqm (area capacity = 15 kW) -> Limited to 5 kW by DISCOM sanctioned load
    const result = await service.runEstimate({
      organisationId: 'vendor-sunvolt-01',
      sanctionLoadKw: 5.0,
      usableAreaSqm: 150.0,
      calculatedByUserId: 'eng-anil-23',
      correlationId: 'corr-eng-200',
    });

    const capOutput = result.outputs.find((o) => o.key === 'recommended_capacity_kw');
    assert.strictEqual(capOutput?.value, 5.0);
  });
});
