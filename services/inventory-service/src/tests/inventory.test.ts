// ==============================================================================
// AETHRA Inventory Service — Concurrency, Ledger & Negative Stock Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import { InventoryApplicationService } from '../application/inventory.service.js';

test('Inventory Service — Double-Entry Ledger, Negative Stock Guard & Reservations', async (t) => {
  await t.test('Scenario 1: Post stock receipt updates on-hand balance and dispatches outbox event', async () => {
    let existingBalance: any = null;
    const ledgerEntries: any[] = [];
    const outboxEvents: any[] = [];

    const mockDb: any = {
      transaction: () => ({
        execute: async (fn: any) => {
          const trxMock = {
            selectFrom: () => ({
              selectAll: () => ({
                where: () => ({
                  where: () => ({
                    where: () => ({
                      forUpdate: () => ({
                        executeTakeFirst: async () => existingBalance,
                      }),
                    }),
                  }),
                }),
              }),
            }),
            insertInto: (table: string) => ({
              values: (vals: any) => {
                if (table === 'stock_balances') existingBalance = vals;
                if (table === 'stock_ledger_entries') ledgerEntries.push(vals);
                if (table === 'outbox_events') outboxEvents.push(vals);
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
                  returningAll: () => ({
                    executeTakeFirstOrThrow: async () => {
                      existingBalance = { ...existingBalance, ...updates };
                      return existingBalance;
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

    const service = new InventoryApplicationService(mockDb);
    const result = await service.postStockMovement({
      organisationId: 'vendor-sunvolt-01',
      warehouseId: 'wh-blr-01',
      catalogueProductId: 'prod-solar-panel-550w',
      movementType: 'receipt',
      quantity: 50,
      unitCost: 18000,
      referenceDocType: 'goods_receipt',
      referenceDocId: 'grn-001',
      createdByUserId: 'usr-wh-manager',
      correlationId: 'corr-inv-101',
    });

    assert.ok(result);
    assert.strictEqual(result.balance.on_hand_quantity, 50);
    assert.strictEqual(result.balance.available_quantity, 50);
    assert.strictEqual(result.balance.average_unit_cost, 18000);
    assert.strictEqual(ledgerEntries.length, 1);
    assert.strictEqual(ledgerEntries[0].quantity, 50);
    assert.strictEqual(outboxEvents.length, 1);
    assert.strictEqual(outboxEvents[0].event_type, 'inventory.stock.received.v1');
    assert.strictEqual(outboxEvents[0].payload.data.quantity, 50);
  });

  await t.test('Scenario 2: Negative Stock Guard (Scenario 9) rejects issue when available balance is insufficient', async () => {
    // Current stock: on_hand = 10, reserved = 8 -> available = 2 units
    const balanceRecord = {
      id: 'bal-001',
      organisation_id: 'vendor-sunvolt-01',
      warehouse_id: 'wh-blr-01',
      catalogue_product_id: 'prod-inverter-5kw',
      on_hand_quantity: 10,
      reserved_quantity: 8,
      available_quantity: 2,
      average_unit_cost: 45000,
    };

    const mockDb: any = {
      transaction: () => ({
        execute: async (fn: any) => {
          const trxMock = {
            selectFrom: () => ({
              selectAll: () => ({
                where: () => ({
                  where: () => ({
                    where: () => ({
                      forUpdate: () => ({
                        executeTakeFirst: async () => balanceRecord,
                      }),
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

    const service = new InventoryApplicationService(mockDb);

    // Requesting 5 units when only 2 are available
    await assert.rejects(
      async () => {
        await service.postStockMovement({
          organisationId: 'vendor-sunvolt-01',
          warehouseId: 'wh-blr-01',
          catalogueProductId: 'prod-inverter-5kw',
          movementType: 'issue',
          quantity: 5,
          unitCost: 45000,
          referenceDocType: 'project_issue',
          referenceDocId: 'prj-001',
          createdByUserId: 'usr-wh-manager',
          correlationId: 'corr-inv-102',
        });
      },
      /INSUFFICIENT_STOCK/,
      'Must reject issue exceeding available balance'
    );
  });

  await t.test('Scenario 3: Stock issue succeeds when balance is sufficient and dispatches outbox event', async () => {
    let balanceRecord: any = {
      id: 'bal-001',
      organisation_id: 'vendor-sunvolt-01',
      warehouse_id: 'wh-blr-01',
      catalogue_product_id: 'prod-inverter-5kw',
      on_hand_quantity: 20,
      reserved_quantity: 5,
      available_quantity: 15,
      average_unit_cost: 45000,
    };

    const outboxEvents: any[] = [];
    const ledgerEntries: any[] = [];

    const mockDb: any = {
      transaction: () => ({
        execute: async (fn: any) => {
          const trxMock = {
            selectFrom: () => ({
              selectAll: () => ({
                where: () => ({
                  where: () => ({
                    where: () => ({
                      forUpdate: () => ({
                        executeTakeFirst: async () => balanceRecord,
                      }),
                    }),
                  }),
                }),
              }),
            }),
            updateTable: () => ({
              set: (updates: any) => ({
                where: () => ({
                  returningAll: () => ({
                    executeTakeFirstOrThrow: async () => {
                      balanceRecord = { ...balanceRecord, ...updates };
                      return balanceRecord;
                    },
                  }),
                }),
              }),
            }),
            insertInto: (table: string) => ({
              values: (vals: any) => {
                if (table === 'stock_ledger_entries') ledgerEntries.push(vals);
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

    const service = new InventoryApplicationService(mockDb);
    const result = await service.postStockMovement({
      organisationId: 'vendor-sunvolt-01',
      warehouseId: 'wh-blr-01',
      catalogueProductId: 'prod-inverter-5kw',
      movementType: 'issue',
      quantity: 5,
      unitCost: 45000,
      referenceDocType: 'project_issue',
      referenceDocId: 'prj-001',
      createdByUserId: 'usr-tech-lead',
      correlationId: 'corr-inv-103',
    });

    assert.strictEqual(result.balance.on_hand_quantity, 15);
    assert.strictEqual(result.balance.available_quantity, 10);
    assert.strictEqual(ledgerEntries.length, 1);
    assert.strictEqual(ledgerEntries[0].quantity, -5);
    assert.strictEqual(outboxEvents.length, 1);
    assert.strictEqual(outboxEvents[0].event_type, 'inventory.stock.issued.v1');
    assert.strictEqual(outboxEvents[0].payload.data.quantity, 5);
  });

  await t.test('Scenario 4: Project stock reservation increases reserved quantity and emits event', async () => {
    let balanceRecord: any = {
      id: 'bal-001',
      organisation_id: 'vendor-sunvolt-01',
      warehouse_id: 'wh-blr-01',
      catalogue_product_id: 'prod-solar-panel-550w',
      on_hand_quantity: 100,
      reserved_quantity: 20,
      available_quantity: 80,
    };

    const outboxEvents: any[] = [];
    const reservations: any[] = [];

    const mockDb: any = {
      transaction: () => ({
        execute: async (fn: any) => {
          const trxMock = {
            selectFrom: () => ({
              selectAll: () => ({
                where: () => ({
                  where: () => ({
                    where: () => ({
                      forUpdate: () => ({
                        executeTakeFirst: async () => balanceRecord,
                      }),
                    }),
                  }),
                }),
              }),
            }),
            updateTable: () => ({
              set: (updates: any) => ({
                where: () => ({
                  execute: async () => {
                    balanceRecord = { ...balanceRecord, ...updates };
                  },
                }),
              }),
            }),
            insertInto: (table: string) => ({
              values: (vals: any) => {
                if (table === 'stock_reservations') reservations.push(vals);
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

    const service = new InventoryApplicationService(mockDb);
    const reservation = await service.reserveStock({
      organisationId: 'vendor-sunvolt-01',
      warehouseId: 'wh-blr-01',
      catalogueProductId: 'prod-solar-panel-550w',
      projectId: 'prj-rooftop-001',
      quantity: 30,
      correlationId: 'corr-res-101',
    });

    assert.ok(reservation);
    assert.strictEqual(reservation.quantity_reserved, 30);
    assert.strictEqual(balanceRecord.reserved_quantity, 50);
    assert.strictEqual(balanceRecord.available_quantity, 50);
    assert.strictEqual(outboxEvents.length, 1);
    assert.strictEqual(outboxEvents[0].event_type, 'inventory.stock.reserved.v1');
    assert.strictEqual(outboxEvents[0].payload.data.quantityReserved, 30);
  });
});
