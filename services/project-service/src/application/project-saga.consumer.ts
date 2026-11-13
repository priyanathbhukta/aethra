// ==============================================================================
// AETHRA Project Service — Quotation Acceptance Distributed Saga Consumer
// ==============================================================================

import {
  EventEnvelope,
  QuotationAcceptedEventPayload,
  KafkaTopics,
  IEventBus,
  InMemoryInboxGuard,
} from '@aethra/event-contracts';
import { ProjectApplicationService } from './project.service.js';
import { createStructuredLogger } from '@aethra/observability';

const logger = createStructuredLogger('project-saga-consumer');

export class ProjectSagaConsumer {
  constructor(
    private readonly projectService: ProjectApplicationService,
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
    logger.info('ProjectSagaConsumer subscribed to KafkaTopics.QUOTATION_ACCEPTED');
  }

  /**
   * Idempotently consumes quotation.accepted.v1 to kick off turnkey EPC solar execution.
   */
  async handleQuotationAccepted(
    envelope: EventEnvelope<QuotationAcceptedEventPayload>
  ): Promise<void> {
    const { eventId } = envelope;
    const payload = envelope.payload || envelope.data;
    const correlationId = envelope.correlationId || envelope.tenantContext?.correlationId || '';

    if (this.inboxGuard.isProcessed(eventId)) {
      logger.info({ eventId, quotationId: payload.quotationId }, 'Duplicate event skipped by inbox guard');
      return;
    }

    logger.info(
      { eventId, quotationId: payload.quotationId, quotationNumber: payload.quotationNumber },
      'Processing Quotation Acceptance Saga -> Auto-creating EPC Project'
    );

    const plannedStart = new Date();
    const plannedCompletion = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days standard turnkey

    await this.projectService.createProject({
      organisationId: payload.organisationId,
      projectName: `Solar Installation (${payload.quotationNumber})`,
      customerId: payload.customerId,
      propertyId: payload.propertyId || `prop-${payload.customerId.slice(0, 8)}`,
      quotationId: payload.quotationId,
      acceptedQuotationRevisionId: payload.revisionId,
      projectType: 'residential_rooftop',
      capacityKw: 10.0, // Standard capacity from engineering/quotation
      plannedStartDate: plannedStart.toISOString(),
      plannedCompletionDate: plannedCompletion.toISOString(),
      siteContactName: 'Site Customer Representative',
      siteContactPhone: '+919876543210',
      siteAddress: 'Project Site Address',
      projectManagerUserId: payload.acceptedByUserId,
      correlationId,
    });

    this.inboxGuard.markProcessed(eventId);
    logger.info(
      { eventId, quotationId: payload.quotationId },
      'Quotation Acceptance Saga completed: Project and milestones created'
    );
  }
}
