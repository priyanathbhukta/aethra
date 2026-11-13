// ==============================================================================
// AETHRA Service Management — Project Handover Distributed Saga Consumer
// ==============================================================================

import {
  EventEnvelope,
  ProjectHandoverCompletedEventPayload,
  KafkaTopics,
  IEventBus,
  InMemoryInboxGuard,
} from '@aethra/event-contracts';
import { ServiceManagementApplicationService } from './service-management.service.js';
import { createStructuredLogger } from '@aethra/observability';

const logger = createStructuredLogger('service-saga-consumer');

export class ServiceManagementSagaConsumer {
  constructor(
    private readonly serviceManagementService: ServiceManagementApplicationService,
    private readonly inboxGuard: InMemoryInboxGuard
  ) {}

  /**
   * Registers topic subscriptions on the provided event bus.
   */
  register(eventBus: IEventBus): void {
    eventBus.subscribe<ProjectHandoverCompletedEventPayload>(
      KafkaTopics.PROJECT_HANDOVER_COMPLETED,
      async (envelope) => this.handleProjectHandoverCompleted(envelope)
    );
    logger.info('ServiceManagementSagaConsumer subscribed to KafkaTopics.PROJECT_HANDOVER_COMPLETED');
  }

  /**
   * Consumes project.handover.completed.v1 to provision warranty and standard AMC coverage.
   */
  async handleProjectHandoverCompleted(
    envelope: EventEnvelope<ProjectHandoverCompletedEventPayload>
  ): Promise<void> {
    const { eventId } = envelope;
    const payload = (envelope.payload || envelope.data)!;

    if (this.inboxGuard.isProcessed(eventId)) {
      logger.info({ eventId, handoverId: payload.handoverId }, 'Duplicate handover event skipped by inbox guard');
      return;
    }

    logger.info(
      {
        eventId,
        handoverId: payload.handoverId,
        projectId: payload.projectId,
        customerId: payload.customerId,
      },
      'Processing Handover Completed Saga -> Auto-provisioning initial warranty & AMC contract'
    );

    const startDate = new Date(payload.handoverDate);
    const endDate = new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000); // 1-year default warranty / AMC

    await this.serviceManagementService.createAmcContract({
      organisationId: payload.organisationId,
      customerId: payload.customerId,
      propertyId: payload.propertyId,
      installationId: payload.projectId, // mapped or linked
      contractTier: 'comprehensive',
      visitsPerYear: 4,
      contractAmount: 0.0, // Included in turnkey contract warranty period
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    });

    this.inboxGuard.markProcessed(eventId);
    logger.info(
      { eventId, projectId: payload.projectId },
      'Initial warranty AMC contract provisioned successfully'
    );
  }
}
