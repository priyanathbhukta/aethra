// ==============================================================================
// AETHRA Project Service — Quotation Acceptance Saga Consumer Tests
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
import { ProjectApplicationService } from '../application/project.service.js';
import { ProjectSagaConsumer } from '../application/project-saga.consumer.js';

test('Project Service — Quotation Acceptance Saga Consumer', async (t) => {
  await t.test('Scenario 1: Consumes quotation.accepted.v1 and creates EPC project with 6 milestones', async () => {
    let createdProject: any = null;
    const createdMilestones: any[] = [];
    const outboxEvents: any[] = [];

    const mockDb: any = {
      transaction: () => ({
        execute: async (fn: any) => {
          const trxMock = {
            insertInto: (table: string) => ({
              values: (vals: any) => {
                if (table === 'projects') createdProject = vals;
                if (table === 'milestones') createdMilestones.push(vals);
                if (table === 'customer_progress_views') { /* noop */ }
                if (table === 'project_sites') { /* noop */ }
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

    const projectService = new ProjectApplicationService(mockDb);
    const inboxGuard = new InMemoryInboxGuard();
    const eventBus = new InMemoryEventBus();
    const sagaConsumer = new ProjectSagaConsumer(projectService, inboxGuard);
    sagaConsumer.register(eventBus);

    const quotationAcceptedPayload: QuotationAcceptedEventPayload = {
      quotationId: 'quot-sol-8899',
      quotationNumber: 'QT-2026-4411',
      revisionNumber: 1,
      revisionId: 'rev-sol-01',
      organisationId: 'org-vendor-sunpower',
      customerId: 'cust-gupta-22',
      propertyId: 'prop-gupta-villas',
      totalPayableAmount: 485000.0,
      acceptedByUserId: 'usr-customer-gupta',
      acceptedAt: new Date().toISOString(),
    };

    const envelope = createEventEnvelope(
      KafkaTopics.QUOTATION_ACCEPTED,
      'aethra-quotation-service',
      {
        organisationId: 'org-vendor-sunpower',
        correlationId: 'corr-saga-3-test',
      },
      quotationAcceptedPayload
    );

    await eventBus.publish(KafkaTopics.QUOTATION_ACCEPTED, envelope);

    // Assert Project Created
    assert.ok(createdProject);
    assert.strictEqual(createdProject.organisation_id, 'org-vendor-sunpower');
    assert.strictEqual(createdProject.customer_id, 'cust-gupta-22');
    assert.strictEqual(createdProject.property_id, 'prop-gupta-villas');
    assert.strictEqual(createdProject.quotation_id, 'quot-sol-8899');
    assert.strictEqual(createdProject.status, 'initiated');
    assert.strictEqual(createdMilestones.length, 6);

    // Assert Outbox Event generated for downstream inventory reservation
    assert.strictEqual(outboxEvents.length, 1);
    assert.strictEqual(outboxEvents[0].event_type, KafkaTopics.PROJECT_CREATED);
    assert.strictEqual(inboxGuard.isProcessed(envelope.eventId), true);
  });

  await t.test('Scenario 2: Idempotency guard skips duplicate quotation.accepted.v1 event without double-creation', async () => {
    let callCount = 0;
    const mockDb: any = {
      transaction: () => ({
        execute: async (fn: any) => {
          callCount++;
          const trxMock = {
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

    const projectService = new ProjectApplicationService(mockDb);
    const inboxGuard = new InMemoryInboxGuard();
    const eventBus = new InMemoryEventBus();
    const sagaConsumer = new ProjectSagaConsumer(projectService, inboxGuard);
    sagaConsumer.register(eventBus);

    const quotationAcceptedPayload: QuotationAcceptedEventPayload = {
      quotationId: 'quot-dup-1',
      quotationNumber: 'QT-2026-9999',
      revisionNumber: 1,
      revisionId: 'rev-dup-1',
      organisationId: 'org-vendor-sunpower',
      customerId: 'cust-dup-1',
      totalPayableAmount: 300000.0,
      acceptedByUserId: 'usr-dup',
      acceptedAt: new Date().toISOString(),
    };

    const envelope = createEventEnvelope(
      KafkaTopics.QUOTATION_ACCEPTED,
      'aethra-quotation-service',
      {
        organisationId: 'org-vendor-sunpower',
        correlationId: 'corr-idempotent-test',
      },
      quotationAcceptedPayload
    );

    // First delivery
    await eventBus.publish(KafkaTopics.QUOTATION_ACCEPTED, envelope);
    assert.strictEqual(callCount, 1);

    // Duplicate delivery with identical eventId
    await eventBus.publish(KafkaTopics.QUOTATION_ACCEPTED, envelope);
    assert.strictEqual(callCount, 1, 'Duplicate event must be skipped by inbox guard');
  });
});
