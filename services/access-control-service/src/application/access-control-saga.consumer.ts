// ==============================================================================
// AETHRA Access Control Service — Relationship Revocation Distributed Saga Consumer
// ==============================================================================

import {
  EventEnvelope,
  VendorRelationshipRevokedEventPayload,
  KafkaTopics,
  IEventBus,
  InMemoryInboxGuard,
} from '@aethra/event-contracts';
import { AccessControlApplicationService } from './access-control.service.js';
import { createStructuredLogger } from '@aethra/observability';

const logger = createStructuredLogger('access-control-saga-consumer');

export class AccessControlSagaConsumer {
  constructor(
    private readonly accessControlService: AccessControlApplicationService,
    private readonly inboxGuard: InMemoryInboxGuard
  ) {}

  /**
   * Registers topic subscriptions on the provided event bus.
   */
  register(eventBus: IEventBus): void {
    eventBus.subscribe<VendorRelationshipRevokedEventPayload>(
      KafkaTopics.VENDOR_RELATIONSHIP_REVOKED,
      async (envelope) => this.handleVendorRelationshipRevoked(envelope)
    );
    logger.info('AccessControlSagaConsumer subscribed to KafkaTopics.VENDOR_RELATIONSHIP_REVOKED');
  }

  /**
   * Consumes vendor_relationship.revoked.v1 to immediately invalidate policy cache
   * and revoke all cross-tenant access tokens/permissions for the customer-vendor pair.
   */
  async handleVendorRelationshipRevoked(
    envelope: EventEnvelope<VendorRelationshipRevokedEventPayload>
  ): Promise<void> {
    const { eventId } = envelope;
    const payload = (envelope.payload || envelope.data)!;

    if (this.inboxGuard.isProcessed(eventId)) {
      logger.info({ eventId, relationshipId: payload.relationshipId }, 'Duplicate relationship.revoked event skipped');
      return;
    }

    logger.info(
      {
        eventId,
        relationshipId: payload.relationshipId,
        organisationId: payload.organisationId,
        customerId: payload.customerId,
      },
      'Processing Relationship Revocation Saga -> Invalidating access control policy cache'
    );

    await this.accessControlService.invalidatePolicyCache({
      organisationId: payload.organisationId,
      reason: 'relationship_revoked',
    });

    this.inboxGuard.markProcessed(eventId);
    logger.info(
      { eventId, relationshipId: payload.relationshipId },
      'Access control policy cache invalidated successfully for revoked relationship'
    );
  }
}
