// ==============================================================================
// AETHRA Product Catalogue Service — Unit & Pricing Security Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import { CatalogueApplicationService } from '../application/catalogue.service.js';

test('Catalogue Service — Master Catalog & Vendor Private Pricing', async (t) => {
  await t.test('Scenario 1: Creates product model in global catalogue', async () => {
    let insertedModel: any = null;
    const mockDb: any = {
      insertInto: (table: string) => {
        assert.strictEqual(table, 'product_models');
        return {
          values: (vals: any) => {
            insertedModel = vals;
            return {
              returningAll: () => ({
                executeTakeFirstOrThrow: async () => vals,
              }),
            };
          },
        };
      },
    };

    const service = new CatalogueApplicationService(mockDb);
    const model = await service.createProductModel({
      categoryId: 'cat-solar-mod',
      brandId: 'brand-waaree',
      modelCode: 'WS-550-BIFI',
      displayName: 'Waaree 550Wp Bifacial Mono PERC Module',
      description: 'TopCon Tier 1 High Efficiency Bifacial Module',
    });

    assert.ok(model);
    assert.strictEqual(insertedModel.model_code, 'WS-550-BIFI');
    assert.strictEqual(insertedModel.display_name, 'Waaree 550Wp Bifacial Mono PERC Module');
  });

  await t.test('Scenario 2: Configures vendor pricing and dispatches catalogue.price.updated.v1 event', async () => {
    const insertedRecords: Record<string, any[]> = {
      vendor_catalogue_entries: [],
      outbox_events: [],
    };

    const mockDb: any = {
      selectFrom: () => ({
        selectAll: () => ({
          where: () => ({
            where: () => ({
              executeTakeFirst: async () => null, // No existing pricing entry
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

    const service = new CatalogueApplicationService(mockDb);
    const entry = await service.setVendorPricing({
      organisationId: 'vendor-sunvolt-01',
      modelId: 'mod-550',
      vendorSku: 'SUN-MOD-550-BIFI',
      standardCostPrice: 11500.0,
      standardSellingPrice: 14200.0,
      minSellingPrice: 13500.0,
      taxRatePercent: 13.8,
      correlationId: 'corr-price-01',
    });

    assert.ok(entry);
    assert.strictEqual(entry.vendor_sku, 'SUN-MOD-550-BIFI');
    assert.strictEqual(entry.standard_selling_price, 14200.0);
    assert.strictEqual(insertedRecords.outbox_events.length, 1);

    const outbox = insertedRecords.outbox_events[0];
    assert.strictEqual(outbox.event_type, 'catalogue.price.updated.v1');
    assert.strictEqual(outbox.payload.data.newStandardSellingPrice, 14200.0);
    assert.strictEqual(outbox.correlation_id, 'corr-price-01');
  });

  await t.test('Scenario 3: Rejects pricing when minSellingPrice exceeds standardSellingPrice (Financial Safety Check)', async () => {
    const mockDb: any = {};
    const service = new CatalogueApplicationService(mockDb);

    await assert.rejects(
      async () => {
        await service.setVendorPricing({
          organisationId: 'vendor-sunvolt-01',
          modelId: 'mod-550',
          vendorSku: 'SUN-MOD-550',
          standardCostPrice: 10000.0,
          standardSellingPrice: 12000.0,
          minSellingPrice: 13000.0, // Invalid: min > standard
          correlationId: 'corr-err',
        });
      },
      /minSellingPrice.*cannot exceed standardSellingPrice/
    );
  });
});
