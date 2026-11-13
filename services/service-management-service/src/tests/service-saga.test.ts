// ==============================================================================
// AETHRA Service Management — Project Handover Saga Consumer Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import {
  createEventEnvelope,
  KafkaTopics,
  InMemoryEventBus,
  InMemoryInboxGuard,
  ProjectHandoverCompletedEventPayload,
} from '@aethra/event-contracts';
import { ServiceManagementApplicationService } from '../application/service-management.service.js';
import { ServiceManagementSagaConsumer } from '../application/service-saga.consumer.js';

test('Service Management — Handover Completion Saga Consumer', async (t) => {
  await t.test('Scenario 1: Consumes project.handover.completed.v1 and auto-provisions AMC warranty', async () => {
    let insertedAmc: any = null;

    const mockDb: any = {
      insertInto: (table: string) => ({
        values: (vals: any) => {
          if (table === 'amc_contracts') insertedAmc = vals;
          return {
            returningAll: () => ({
              executeTakeFirstOrThrow: async () => vals,
            }),
            execute: async () => {},
          };
        },
      }),
    };

    const service = new ServiceManagementApplicationService(mockDb);
    const inboxGuard = new InMemoryInboxGuard();
    const eventBus = new InMemoryEventBus();
    const sagaConsumer = new ServiceManagementSagaConsumer(service, inboxGuard);
    sagaConsumer.register(eventBus);

    const handoverPayload: ProjectHandoverCompletedEventPayload = {
      handoverId: 'ho-8800',
      projectId: 'prj-solar-100',
      organisationId: 'vendor-tata-solar',
      customerId: 'cust-mehta-44',
      propertyId: 'prop-mehta-farm',
      capacityKw: 15.0,
      handoverDate: '2026-11-20T00:00:00Z',
      commissioningReportDocId: 'doc-report-88',
      completedAt: new Date().toISOString(),
    };

    const envelope = createEventEnvelope(
      KafkaTopics.PROJECT_HANDOVER_COMPLETED,
      'aethra-project-service',
      {
        organisationId: 'vendor-tata-solar',
        correlationId: 'corr-amc-saga-5',
      },
      handoverPayload
    );

    await eventBus.publish(KafkaTopics.PROJECT_HANDOVER_COMPLETED, envelope);

    // Verify AMC warranty contract creation
    assert.ok(insertedAmc);
    assert.strictEqual(insertedAmc.customer_id, 'cust-mehta-44');
    assert.strictEqual(insertedAmc.contract_tier, 'comprehensive');
    assert.strictEqual(insertedAmc.contract_amount, 0.0);
    assert.strictEqual(insertedAmc.visits_per_year, 4);
    assert.match(insertedAmc.amc_code, /^AMC-\d{4}-\d{4}$/);
    assert.strictEqual(inboxGuard.isProcessed(envelope.eventId), true);
  });

  await t.test('Scenario 2: Idempotent inbox guard skips duplicate handover event', async () => {
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

    const service = new ServiceManagementApplicationService(mockDb);
    const inboxGuard = new InMemoryInboxGuard();
    const eventBus = new InMemoryEventBus();
    const sagaConsumer = new ServiceManagementSagaConsumer(service, inboxGuard);
    sagaConsumer.register(eventBus);

    const handoverPayload: ProjectHandoverCompletedEventPayload = {
      handoverId: 'ho-dup',
      projectId: 'prj-dup',
      organisationId: 'vendor-dup',
      customerId: 'cust-dup',
      propertyId: 'prop-dup',
      capacityKw: 5.0,
      handoverDate: '2026-11-20T00:00:00Z',
      commissioningReportDocId: 'doc-dup',
      completedAt: new Date().toISOString(),
    };

    const envelope = createEventEnvelope(
      KafkaTopics.PROJECT_HANDOVER_COMPLETED,
      'aethra-project-service',
      {
        organisationId: 'vendor-dup',
        correlationId: 'corr-dup',
      },
      handoverPayload
    );

    await eventBus.publish(KafkaTopics.PROJECT_HANDOVER_COMPLETED, envelope);
    assert.strictEqual(callCount, 1);

    // Duplicate
    await eventBus.publish(KafkaTopics.PROJECT_HANDOVER_COMPLETED, envelope);
    assert.strictEqual(callCount, 1, 'Duplicate handover event must be skipped');
  });
});
