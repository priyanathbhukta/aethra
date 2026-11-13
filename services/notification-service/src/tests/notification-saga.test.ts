// ==============================================================================
// AETHRA Notification Service — Quotation Acceptance Saga Consumer Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import {
  createEventEnvelope,
  KafkaTopics,
  InMemoryEventBus,
  InMemoryInboxGuard,
  QuotationAcceptedEventPayload,
} from '@aethra/event-contracts';
import { NotificationApplicationService } from '../application/notification.service.js';
import { NotificationSagaConsumer } from '../application/notification-saga.consumer.js';

test('Notification Service — Quotation Acceptance Saga Consumer', async (t) => {
  await t.test('Scenario 1: Consumes quotation.accepted.v1 and creates in-app notification', async () => {
    let createdNotification: any = null;

    const mockDb: any = {
      insertInto: (table: string) => ({
        values: (vals: any) => {
          if (table === 'in_app_notifications') createdNotification = vals;
          return {
            returningAll: () => ({
              executeTakeFirstOrThrow: async () => vals,
            }),
            execute: async () => {},
          };
        },
      }),
    };

    const service = new NotificationApplicationService(mockDb);
    const inboxGuard = new InMemoryInboxGuard();
    const eventBus = new InMemoryEventBus();
    const sagaConsumer = new NotificationSagaConsumer(service, inboxGuard);
    sagaConsumer.register(eventBus);

    const quotationAcceptedPayload: QuotationAcceptedEventPayload = {
      quotationId: 'quot-notif-1',
      quotationNumber: 'QT-2026-8888',
      revisionNumber: 1,
      revisionId: 'rev-notif-1',
      organisationId: 'vendor-sun-org',
      customerId: 'cust-notif-1',
      totalPayableAmount: 420000.0,
      acceptedByUserId: 'usr-customer-anil',
      acceptedAt: new Date().toISOString(),
    };

    const envelope = createEventEnvelope(
      KafkaTopics.QUOTATION_ACCEPTED,
      'aethra-quotation-service',
      {
        organisationId: 'vendor-sun-org',
        correlationId: 'corr-notif-saga',
      },
      quotationAcceptedPayload
    );

    await eventBus.publish(KafkaTopics.QUOTATION_ACCEPTED, envelope);

    // Verify in-app notification creation
    assert.ok(createdNotification);
    assert.strictEqual(createdNotification.recipient_user_id, 'usr-customer-anil');
    assert.strictEqual(createdNotification.title, 'Quotation Accepted — Project Initiated');
    assert.match(createdNotification.body, /QT-2026-8888/);
    assert.strictEqual(inboxGuard.isProcessed(envelope.eventId), true);
  });

  await t.test('Scenario 2: Idempotent inbox guard skips duplicate quotation accepted event', async () => {
    let callCount = 0;
    const mockDb: any = {
      insertInto: () => ({
        values: (vals: any) => {
          callCount++;
          return {
            returningAll: () => ({
              executeTakeFirstOrThrow: async () => vals,
            }),
            execute: async () => {},
          };
        },
      }),
    };

    const service = new NotificationApplicationService(mockDb);
    const inboxGuard = new InMemoryInboxGuard();
    const eventBus = new InMemoryEventBus();
    const sagaConsumer = new NotificationSagaConsumer(service, inboxGuard);
    sagaConsumer.register(eventBus);

    const quotationAcceptedPayload: QuotationAcceptedEventPayload = {
      quotationId: 'quot-dup-notif',
      quotationNumber: 'QT-2026-0000',
      revisionNumber: 1,
      revisionId: 'rev-dup-notif',
      organisationId: 'vendor-dup',
      customerId: 'cust-dup',
      totalPayableAmount: 200000.0,
      acceptedByUserId: 'usr-dup',
      acceptedAt: new Date().toISOString(),
    };

    const envelope = createEventEnvelope(
      KafkaTopics.QUOTATION_ACCEPTED,
      'aethra-quotation-service',
      {
        organisationId: 'vendor-dup',
        correlationId: 'corr-dup',
      },
      quotationAcceptedPayload
    );

    await eventBus.publish(KafkaTopics.QUOTATION_ACCEPTED, envelope);
    assert.strictEqual(callCount, 1);

    // Duplicate
    await eventBus.publish(KafkaTopics.QUOTATION_ACCEPTED, envelope);
    assert.strictEqual(callCount, 1, 'Duplicate quotation accepted event must be skipped');
  });
});
