// ==============================================================================
// AETHRA Customer Service — Project Handover Distributed Saga Consumer
// ==============================================================================

import {
  EventEnvelope,
  ProjectHandoverCompletedEventPayload,
  KafkaTopics,
  IEventBus,
  InMemoryInboxGuard,
} from '@aethra/event-contracts';
import { CustomerApplicationService } from './customer.service.js';
import { createStructuredLogger } from '@aethra/observability';

const logger = createStructuredLogger('customer-saga-consumer');

export class CustomerSagaConsumer {
  constructor(
    private readonly customerService: CustomerApplicationService,
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
    logger.info('CustomerSagaConsumer subscribed to KafkaTopics.PROJECT_HANDOVER_COMPLETED');
  }

  /**
   * Consumes project.handover.completed.v1 to activate customer installation to 'operational'.
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
        propertyId: payload.propertyId,
        customerId: payload.customerId,
        capacityKw: payload.capacityKw,
      },
      'Processing Handover Completed Saga -> Activating customer installation to operational'
    );

    await this.customerService.updateInstallationStatus({
      propertyId: payload.propertyId,
      status: 'operational',
      commissionedDate: new Date(payload.handoverDate),
      commissioningCertificateDocId: payload.commissioningReportDocId,
      capacityKw: payload.capacityKw,
    });

    this.inboxGuard.markProcessed(eventId);
    logger.info(
      { eventId, propertyId: payload.propertyId },
      'Customer installation marked operational successfully'
    );
  }
}
