// ==============================================================================
// AETHRA Notification Service — Distributed Saga Consumer
// ==============================================================================

import {
  EventEnvelope,
  QuotationAcceptedEventPayload,
  KafkaTopics,
  IEventBus,
  InMemoryInboxGuard,
} from '@aethra/event-contracts';
import { NotificationApplicationService } from './notification.service.js';
import { createStructuredLogger } from '@aethra/observability';

const logger = createStructuredLogger('notification-saga-consumer');

export class NotificationSagaConsumer {
  constructor(
    private readonly notificationService: NotificationApplicationService,
    private readonly inboxGuard: InMemoryInboxGuard
  ) {}

  /**
   * Registers topic subscriptions on the provided event bus.
   */
  register(eventBus: IEventBus): void {
    eventBus.subscribe<QuotationAcceptedEventPayload>(
      KafkaTopics.QUOTATION_ACCEPTED,
      async (envelope) => this.handleQuotationAccepted(envelope)
    );
    logger.info('NotificationSagaConsumer subscribed to KafkaTopics.QUOTATION_ACCEPTED');
  }

  /**
   * Consumes quotation.accepted.v1 to alert customer and operations team of project kickoff.
   */
  async handleQuotationAccepted(
    envelope: EventEnvelope<QuotationAcceptedEventPayload>
  ): Promise<void> {
    const { eventId } = envelope;
    const payload = (envelope.payload || envelope.data)!;

    if (this.inboxGuard.isProcessed(eventId)) {
      logger.info({ eventId, quotationId: payload.quotationId }, 'Duplicate event skipped by inbox guard');
      return;
    }

    logger.info(
      { eventId, quotationId: payload.quotationId, quotationNumber: payload.quotationNumber },
      'Processing Quotation Acceptance Saga -> Dispatching customer notification'
    );

    // Create In-App Notification
    await this.notificationService.createInAppNotification({
      recipientUserId: payload.acceptedByUserId,
      organisationId: payload.organisationId,
      title: 'Quotation Accepted — Project Initiated',
      body: `Your quotation ${payload.quotationNumber} has been accepted. Engineering and procurement kickoff has begun.`,
      linkAction: `/projects?quotationId=${payload.quotationId}`,
    });

    this.inboxGuard.markProcessed(eventId);
    logger.info(
      { eventId, quotationId: payload.quotationId },
      'Notification dispatched for accepted quotation'
    );
  }
}
