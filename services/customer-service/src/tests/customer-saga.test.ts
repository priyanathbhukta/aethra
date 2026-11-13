// ==============================================================================
// AETHRA Customer Service — Project Handover Saga Consumer Tests
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
import { CustomerApplicationService } from '../application/customer.service.js';
import { CustomerSagaConsumer } from '../application/customer-saga.consumer.js';

test('Customer Service — Handover Completion Saga Consumer', async (t) => {
  await t.test('Scenario 1: Consumes project.handover.completed.v1 and marks property installation operational', async () => {
    let updatedInstallation: any = null;

    const mockDb: any = {
      selectFrom: () => ({
        selectAll: () => ({
          where: () => ({
            executeTakeFirst: async () => ({
              id: 'inst-sharma-rooftop-01',
              property_id: 'prop-sharma-indiranagar',
              status: 'planned',
            }),
          }),
        }),
      }),
      updateTable: () => ({
        set: (vals: any) => ({
          where: () => ({
            returningAll: () => ({
              executeTakeFirstOrThrow: async () => {
                updatedInstallation = vals;
                return vals;
              },
            }),
          }),
        }),
      }),
    };

    const customerService = new CustomerApplicationService(mockDb);
    const inboxGuard = new InMemoryInboxGuard();
    const eventBus = new InMemoryEventBus();
    const sagaConsumer = new CustomerSagaConsumer(customerService, inboxGuard);
    sagaConsumer.register(eventBus);

    const handoverPayload: ProjectHandoverCompletedEventPayload = {
      handoverId: 'handover-7788',
      projectId: 'prj-indiranagar-5kw',
      organisationId: 'vendor-sunvolt',
      customerId: 'cust-sharma-99',
      propertyId: 'prop-sharma-indiranagar',
      capacityKw: 5.0,
      handoverDate: '2026-11-25T10:00:00Z',
      commissioningReportDocId: 'doc-ceig-approval-signed-001',
      completedAt: new Date().toISOString(),
    };

    const envelope = createEventEnvelope(
      KafkaTopics.PROJECT_HANDOVER_COMPLETED,
      'aethra-project-service',
      {
        organisationId: 'vendor-sunvolt',
        correlationId: 'corr-handover-saga-5',
      },
      handoverPayload
    );

    await eventBus.publish(KafkaTopics.PROJECT_HANDOVER_COMPLETED, envelope);

    // Verify operational activation
    assert.ok(updatedInstallation);
    assert.strictEqual(updatedInstallation.status, 'operational');
    assert.strictEqual(updatedInstallation.commissioning_certificate_doc_id, 'doc-ceig-approval-signed-001');
    assert.strictEqual(inboxGuard.isProcessed(envelope.eventId), true);
  });

  await t.test('Scenario 2: Idempotent inbox guard skips duplicate handover event', async () => {
    let updateCount = 0;
    const mockDb: any = {
      selectFrom: () => ({
        selectAll: () => ({
          where: () => ({
            executeTakeFirst: async () => ({
              id: 'inst-dup',
              property_id: 'prop-dup',
              status: 'planned',
            }),
          }),
        }),
      }),
      updateTable: () => ({
        set: (vals: any) => ({
          where: () => ({
            returningAll: () => ({
              executeTakeFirstOrThrow: async () => {
                updateCount++;
                return vals;
              },
            }),
          }),
        }),
      }),
    };

    const customerService = new CustomerApplicationService(mockDb);
    const inboxGuard = new InMemoryInboxGuard();
    const eventBus = new InMemoryEventBus();
    const sagaConsumer = new CustomerSagaConsumer(customerService, inboxGuard);
    sagaConsumer.register(eventBus);

    const handoverPayload: ProjectHandoverCompletedEventPayload = {
      handoverId: 'handover-dup',
      projectId: 'prj-dup',
      organisationId: 'vendor-sunvolt',
      customerId: 'cust-dup',
      propertyId: 'prop-dup',
      capacityKw: 10.0,
      handoverDate: '2026-11-25T10:00:00Z',
      commissioningReportDocId: 'doc-dup',
      completedAt: new Date().toISOString(),
    };

    const envelope = createEventEnvelope(
      KafkaTopics.PROJECT_HANDOVER_COMPLETED,
      'aethra-project-service',
      {
        organisationId: 'vendor-sunvolt',
        correlationId: 'corr-dup',
      },
      handoverPayload
    );

    await eventBus.publish(KafkaTopics.PROJECT_HANDOVER_COMPLETED, envelope);
    assert.strictEqual(updateCount, 1);

    // Duplicate
    await eventBus.publish(KafkaTopics.PROJECT_HANDOVER_COMPLETED, envelope);
    assert.strictEqual(updateCount, 1, 'Duplicate handover event must be skipped');
  });
});
