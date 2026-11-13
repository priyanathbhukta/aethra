// ==============================================================================
// AETHRA Integration Service — Webhook Intake & Telemetry Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import { IntegrationApplicationService } from '../application/integration.service.js';

test('Integration Service — Webhook Idempotency & Telemetry Sync', async (t) => {
  await t.test('Scenario 1: Configures integration connection for Inverter IoT provider', async () => {
    let createdConn: any = null;

    const mockDb: any = {
      selectFrom: () => ({
        selectAll: () => ({
          where: () => ({
            executeTakeFirst: async () => ({
              id: 'p-growatt',
              provider_code: 'growatt_shine',
              name: 'Growatt ShineServer',
            }),
          }),
        }),
      }),
      insertInto: () => ({
        values: (vals: any) => {
          createdConn = vals;
          return {
            returningAll: () => ({
              executeTakeFirstOrThrow: async () => vals,
            }),
          };
        },
      }),
    };

    const service = new IntegrationApplicationService(mockDb);
    const conn = await service.createConnection({
      organisationId: 'vendor-sunvolt-01',
      providerCode: 'growatt_shine',
      connectionName: 'Bangalore East Inverter Fleet',
      encryptedCredentialsRef: 'arn:aws:secretsmanager:ap-south-1:123456:secret:growatt-key',
    });

    assert.ok(conn);
    assert.strictEqual(conn.connection_name, 'Bangalore East Inverter Fleet');
    assert.strictEqual(conn.status, 'active');
    assert.ok(createdConn);
  });

  await t.test('Scenario 2: Webhook intake computes payload hash and records delivery', async () => {
    let recordedDelivery: any = null;

    const mockDb: any = {
      selectFrom: () => ({
        selectAll: () => ({
          where: () => ({
            executeTakeFirst: async () => null, // no existing endpoint
            where: () => ({
              executeTakeFirst: async () => null, // no existing delivery (first time)
            }),
          }),
        }),
      }),
      insertInto: () => ({
        values: (vals: any) => {
          recordedDelivery = vals;
          return {
            returningAll: () => ({
              executeTakeFirstOrThrow: async () => vals,
            }),
          };
        },
      }),
    };

    const service = new IntegrationApplicationService(mockDb);
    const payload = { event: 'payment.captured', order_id: 'ord_123', amount: 257940 };

    const result = await service.handleWebhookIntake({
      endpointPath: '/api/v1/integrations/webhooks/razorpay',
      payload,
      eventIdHeader: 'evt_rzp_999',
    });

    assert.ok(result);
    assert.strictEqual(result.received, true);
    assert.strictEqual(result.duplicate, false);
    assert.ok(recordedDelivery);
    assert.strictEqual(recordedDelivery.processing_status, 'received');
    assert.strictEqual(recordedDelivery.event_id_header, 'evt_rzp_999');
  });

  await t.test('Scenario 3: Webhook idempotency ignores duplicate delivery with identical hash', async () => {
    const existingDelivery = {
      id: 'del-existing-001',
      endpoint_id: 'ep-001',
      payload_hash: 'matching-hash',
      processing_status: 'received',
    };

    const mockDb: any = {
      selectFrom: () => ({
        selectAll: () => ({
          where: () => ({
            executeTakeFirst: async () => ({ id: 'ep-001' }),
            where: () => ({
              executeTakeFirst: async () => existingDelivery, // Duplicate found!
            }),
          }),
        }),
      }),
    };

    const service = new IntegrationApplicationService(mockDb);
    const payload = { event: 'inverter.telemetry', serial: 'INV-5KW-001', pac_w: 4850 };

    const result = await service.handleWebhookIntake({
      endpointPath: '/api/v1/integrations/webhooks/growatt',
      payload,
    });

    assert.ok(result);
    assert.strictEqual(result.received, true);
    assert.strictEqual(result.duplicate, true);
    assert.strictEqual(result.processingStatus, 'ignored');
    assert.strictEqual(result.deliveryId, 'del-existing-001');
  });

  await t.test('Scenario 4: Updates telemetry synchronization cursor', async () => {
    let updatedSync: any = null;

    const mockDb: any = {
      selectFrom: () => ({
        selectAll: () => ({
          where: () => ({
            where: () => ({
              executeTakeFirst: async () => ({ id: 'sync-001' }), // existing sync record
            }),
          }),
        }),
      }),
      updateTable: () => ({
        set: (updates: any) => ({
          where: () => ({
            returningAll: () => ({
              executeTakeFirstOrThrow: async () => {
                updatedSync = updates;
                return updates;
              },
            }),
          }),
        }),
      }),
    };

    const service = new IntegrationApplicationService(mockDb);
    const sync = await service.recordTelemetrySync(
      'conn-001',
      'inverter_telemetry',
      'cursor-ts-2026-11-22T10:00:00Z',
      120
    );

    assert.ok(sync);
    assert.strictEqual(updatedSync.records_processed, 120);
    assert.strictEqual(updatedSync.last_cursor, 'cursor-ts-2026-11-22T10:00:00Z');
  });
});
