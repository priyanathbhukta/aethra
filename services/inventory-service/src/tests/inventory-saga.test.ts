// ==============================================================================
// AETHRA Inventory Service — Distributed Saga Consumer Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import {
  createEventEnvelope,
  KafkaTopics,
  InMemoryEventBus,
  InMemoryInboxGuard,
  GoodsReceiptConfirmedEventPayload,
  ProjectCreatedEventPayload,
} from '@aethra/event-contracts';
import { InventoryApplicationService } from '../application/inventory.service.js';
import { InventorySagaConsumer } from '../application/inventory-saga.consumer.js';

test('Inventory Service — Distributed Saga Consumer', async (t) => {
  await t.test('Scenario 1: Consumes procurement.goods_receipt.confirmed.v1 to automatically post stock intake', async () => {
    let insertedBalance: any = null;
    let insertedLedger: any = null;
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
                        executeTakeFirst: async () => null, // No existing balance, will create
                      }),
                    }),
                  }),
                }),
              }),
            }),
            insertInto: (table: string) => ({
              values: (vals: any) => {
                if (table === 'stock_balances') insertedBalance = vals;
                if (table === 'stock_ledger_entries') insertedLedger = vals;
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

    const inventoryService = new InventoryApplicationService(mockDb);
    const inboxGuard = new InMemoryInboxGuard();
    const eventBus = new InMemoryEventBus();
    const sagaConsumer = new InventorySagaConsumer(inventoryService, inboxGuard);
    sagaConsumer.register(eventBus);

    const grnPayload: GoodsReceiptConfirmedEventPayload = {
      grnId: 'grn-po-7701',
      grnCode: 'GRN-2026-1234',
      organisationId: 'vendor-sol-corp',
      poId: 'po-9900',
      supplierId: 'supp-tata-power',
      destinationWarehouseId: 'wh-blr-central',
      deliveryChallanNumber: 'DC-99212',
      itemCount: 4,
      receivedAt: new Date().toISOString(),
    };

    const envelope = createEventEnvelope(
      KafkaTopics.PROCUREMENT_GOODS_RECEIPT_CONFIRMED,
      'aethra-procurement-service',
      {
        organisationId: 'vendor-sol-corp',
        correlationId: 'corr-grn-saga-4',
      },
      grnPayload
    );

    await eventBus.publish(KafkaTopics.PROCUREMENT_GOODS_RECEIPT_CONFIRMED, envelope);

    // Verify stock balance and ledger entries created
    assert.ok(insertedBalance);
    assert.strictEqual(insertedBalance.warehouse_id, 'wh-blr-central');
    assert.strictEqual(insertedBalance.on_hand_quantity, 40); // 4 items * 10

    assert.ok(insertedLedger);
    assert.strictEqual(insertedLedger.movement_type, 'receipt');
    assert.strictEqual(insertedLedger.reference_doc_type, 'goods_receipt');
    assert.strictEqual(insertedLedger.reference_doc_id, 'grn-po-7701');

    assert.strictEqual(inboxGuard.isProcessed(envelope.eventId), true);
  });

  await t.test('Scenario 2: Consumes project.created.v1 and checks warehouse stock availability', async () => {
    let listWarehousesCalled = false;
    const mockDb: any = {
      selectFrom: (table: string) => ({
        selectAll: () => ({
          where: () => ({
            where: () => ({
              orderBy: () => ({
                execute: async () => {
                  if (table === 'warehouses') {
                    listWarehousesCalled = true;
                    return [{ id: 'wh-1', name: 'Main Yard', organisation_id: 'org-1' }];
                  }
                  return [];
                },
              }),
            }),
          }),
        }),
      }),
    };

    const inventoryService = new InventoryApplicationService(mockDb);
    const inboxGuard = new InMemoryInboxGuard();
    const eventBus = new InMemoryEventBus();
    const sagaConsumer = new InventorySagaConsumer(inventoryService, inboxGuard);
    sagaConsumer.register(eventBus);

    const projectCreatedPayload: ProjectCreatedEventPayload = {
      projectId: 'prj-solar-111',
      projectCode: 'PRJ-2026-1111',
      organisationId: 'org-vendor-sun',
      customerId: 'cust-123',
      propertyId: 'prop-456',
      capacityKw: 10.0,
      projectManagerUserId: 'usr-pm-1',
      createdAt: new Date().toISOString(),
    };

    const envelope = createEventEnvelope(
      KafkaTopics.PROJECT_CREATED,
      'aethra-project-service',
      {
        organisationId: 'org-vendor-sun',
        correlationId: 'corr-proj-saga-3',
      },
      projectCreatedPayload
    );

    await eventBus.publish(KafkaTopics.PROJECT_CREATED, envelope);

    assert.strictEqual(listWarehousesCalled, true);
    assert.strictEqual(inboxGuard.isProcessed(envelope.eventId), true);
  });

  await t.test('Scenario 3: Idempotent inbox guard prevents duplicate goods receipt intake', async () => {
    let callCount = 0;
    const mockDb: any = {
      transaction: () => ({
        execute: async (fn: any) => {
          callCount++;
          const trxMock = {
            selectFrom: () => ({
              selectAll: () => ({
                where: () => ({
                  where: () => ({
                    where: () => ({
                      forUpdate: () => ({
                        executeTakeFirst: async () => null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
            insertInto: () => ({
              values: (vals: any) => ({
                returningAll: () => ({
                  executeTakeFirstOrThrow: async () => vals,
                }),
                execute: async () => {},
              }),
            }),
          };
          return fn(trxMock);
        },
      }),
    };

    const inventoryService = new InventoryApplicationService(mockDb);
    const inboxGuard = new InMemoryInboxGuard();
    const eventBus = new InMemoryEventBus();
    const sagaConsumer = new InventorySagaConsumer(inventoryService, inboxGuard);
    sagaConsumer.register(eventBus);

    const grnPayload: GoodsReceiptConfirmedEventPayload = {
      grnId: 'grn-dup-test',
      grnCode: 'GRN-2026-9999',
      organisationId: 'vendor-sol-corp',
      poId: 'po-9900',
      supplierId: 'supp-tata',
      destinationWarehouseId: 'wh-1',
      deliveryChallanNumber: 'DC-1',
      itemCount: 2,
      receivedAt: new Date().toISOString(),
    };

    const envelope = createEventEnvelope(
      KafkaTopics.PROCUREMENT_GOODS_RECEIPT_CONFIRMED,
      'aethra-procurement-service',
      {
        organisationId: 'vendor-sol-corp',
        correlationId: 'corr-dup',
      },
      grnPayload
    );

    await eventBus.publish(KafkaTopics.PROCUREMENT_GOODS_RECEIPT_CONFIRMED, envelope);
    assert.strictEqual(callCount, 1);

    // Duplicate delivery
    await eventBus.publish(KafkaTopics.PROCUREMENT_GOODS_RECEIPT_CONFIRMED, envelope);
    assert.strictEqual(callCount, 1, 'Duplicate GRN confirmed event must be ignored');
  });
});
