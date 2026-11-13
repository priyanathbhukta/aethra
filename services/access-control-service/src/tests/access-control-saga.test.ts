// ==============================================================================
// AETHRA Access Control — Relationship Revocation Saga Consumer Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import {
  createEventEnvelope,
  KafkaTopics,
  InMemoryEventBus,
  InMemoryInboxGuard,
  VendorRelationshipRevokedEventPayload,
} from '@aethra/event-contracts';
import { AccessControlApplicationService } from '../application/access-control.service.js';
import { AccessControlSagaConsumer } from '../application/access-control-saga.consumer.js';

test('Access Control — Relationship Revocation Saga Consumer', async (t) => {
  await t.test('Scenario 1: Consumes vendor_relationship.revoked.v1 and invalidates policy cache', async () => {
    let invalidationRecorded: any = null;

    const mockDb: any = {};
    const service = new AccessControlApplicationService(mockDb);

    // Spy on invalidatePolicyCache
    const originalInvalidate = service.invalidatePolicyCache.bind(service);
    service.invalidatePolicyCache = async (cmd) => {
      invalidationRecorded = cmd;
      return originalInvalidate(cmd);
    };

    const inboxGuard = new InMemoryInboxGuard();
    const eventBus = new InMemoryEventBus();
    const sagaConsumer = new AccessControlSagaConsumer(service, inboxGuard);
    sagaConsumer.register(eventBus);

    const revokedPayload: VendorRelationshipRevokedEventPayload = {
      relationshipId: 'rel-rev-7711',
      organisationId: 'vendor-helios-solar',
      customerId: 'cust-sharma-99',
      revocationReason: 'Customer opted out of vendor service agreement',
      revokedByUserId: 'usr-customer-sharma',
      revokedAt: new Date().toISOString(),
    };

    const envelope = createEventEnvelope(
      KafkaTopics.VENDOR_RELATIONSHIP_REVOKED,
      'aethra-vendor-relationship-service',
      {
        organisationId: 'vendor-helios-solar',
        correlationId: 'corr-revocation-saga-6',
      },
      revokedPayload
    );

    await eventBus.publish(KafkaTopics.VENDOR_RELATIONSHIP_REVOKED, envelope);

    // Assert cache invalidation triggered
    assert.ok(invalidationRecorded);
    assert.strictEqual(invalidationRecorded.organisationId, 'vendor-helios-solar');
    assert.strictEqual(invalidationRecorded.reason, 'relationship_revoked');
    assert.strictEqual(inboxGuard.isProcessed(envelope.eventId), true);
  });

  await t.test('Scenario 2: Idempotent inbox guard skips duplicate revocation event', async () => {
    let callCount = 0;
    const mockDb: any = {};
    const service = new AccessControlApplicationService(mockDb);
    service.invalidatePolicyCache = async (_cmd) => {
      callCount++;
      return { invalidated: true, timestamp: new Date().toISOString() };
    };

    const inboxGuard = new InMemoryInboxGuard();
    const eventBus = new InMemoryEventBus();
    const sagaConsumer = new AccessControlSagaConsumer(service, inboxGuard);
    sagaConsumer.register(eventBus);

    const revokedPayload: VendorRelationshipRevokedEventPayload = {
      relationshipId: 'rel-dup',
      organisationId: 'vendor-dup',
      customerId: 'cust-dup',
      revocationReason: 'Terminated',
      revokedByUserId: 'usr-admin',
      revokedAt: new Date().toISOString(),
    };

    const envelope = createEventEnvelope(
      KafkaTopics.VENDOR_RELATIONSHIP_REVOKED,
      'aethra-vendor-relationship-service',
      {
        organisationId: 'vendor-dup',
        correlationId: 'corr-dup',
      },
      revokedPayload
    );

    await eventBus.publish(KafkaTopics.VENDOR_RELATIONSHIP_REVOKED, envelope);
    assert.strictEqual(callCount, 1);

    // Duplicate
    await eventBus.publish(KafkaTopics.VENDOR_RELATIONSHIP_REVOKED, envelope);
    assert.strictEqual(callCount, 1, 'Duplicate revocation event must be skipped');
  });
});
