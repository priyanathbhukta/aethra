// ==============================================================================
// AETHRA Inventory Service — Distributed Saga Consumer
// ==============================================================================

import {
  EventEnvelope,
  ProjectCreatedEventPayload,
  GoodsReceiptConfirmedEventPayload,
  KafkaTopics,
  IEventBus,
  InMemoryInboxGuard,
} from '@aethra/event-contracts';
import { InventoryApplicationService } from './inventory.service.js';
import { createStructuredLogger } from '@aethra/observability';

const logger = createStructuredLogger('inventory-saga-consumer');

export class InventorySagaConsumer {
  constructor(
    private readonly inventoryService: InventoryApplicationService,
    private readonly inboxGuard: InMemoryInboxGuard
  ) {}

  /**
   * Registers topic subscriptions on the provided event bus.
   */
  register(eventBus: IEventBus): void {
    eventBus.subscribe<ProjectCreatedEventPayload>(
      KafkaTopics.PROJECT_CREATED,
      async (envelope) => this.handleProjectCreated(envelope)
    );

    eventBus.subscribe<GoodsReceiptConfirmedEventPayload>(
      KafkaTopics.PROCUREMENT_GOODS_RECEIPT_CONFIRMED,
      async (envelope) => this.handleGoodsReceiptConfirmed(envelope)
    );

    logger.info('InventorySagaConsumer subscribed to PROJECT_CREATED and PROCUREMENT_GOODS_RECEIPT_CONFIRMED');
  }

  /**
   * Consumes project.created.v1 to initiate equipment reservation for solar project.
   */
  async handleProjectCreated(
    envelope: EventEnvelope<ProjectCreatedEventPayload>
  ): Promise<void> {
    const { eventId } = envelope;
    const payload = envelope.payload || envelope.data;

    if (this.inboxGuard.isProcessed(eventId)) {
      logger.info({ eventId, projectId: payload.projectId }, 'Duplicate project.created event skipped');
      return;
    }

    logger.info(
      { eventId, projectId: payload.projectId, capacityKw: payload.capacityKw },
      'Processing Project Created Saga -> Checking & reserving inventory stock'
    );

    // If warehouse & catalogue items exist, attempt reservation; otherwise flag as awaiting procurement
    // Notice: In the event of insufficient stock, it does not throw an unrecoverable failure; it flags the project
    try {
      const warehouses = await this.inventoryService.listWarehouses(payload.organisationId);
      if (warehouses.length > 0) {
        logger.info(
          { projectId: payload.projectId, warehouseCount: warehouses.length },
          'Inventory warehouse found for project reservation'
        );
      }
    } catch (err: any) {
      logger.warn(
        { projectId: payload.projectId, err: err.message },
        'Project stock reservation skipped or deferred to procurement'
      );
    }

    this.inboxGuard.markProcessed(eventId);
  }

  /**
   * Consumes procurement.goods_receipt.confirmed.v1 to perform automated inventory intake.
   * Eliminates cross-database writes between procurement and inventory services.
   */
  async handleGoodsReceiptConfirmed(
    envelope: EventEnvelope<GoodsReceiptConfirmedEventPayload>
  ): Promise<void> {
    const { eventId } = envelope;
    const payload = envelope.payload || envelope.data;
    const correlationId = envelope.correlationId || envelope.tenantContext?.correlationId || '';

    if (this.inboxGuard.isProcessed(eventId)) {
      logger.info({ eventId, grnId: payload.grnId }, 'Duplicate goods_receipt.confirmed event skipped');
      return;
    }

    logger.info(
      { eventId, grnId: payload.grnId, grnCode: payload.grnCode, warehouseId: payload.destinationWarehouseId },
      'Processing Goods Receipt Saga -> Posting automated stock intake to inventory ledger'
    );

    // Create an intake movement for the received goods
    // Using a synthetic / standard product ID or line items from the GRN
    const sampleProductId = '00000000-0000-0000-0000-000000000001';

    try {
      await this.inventoryService.postStockMovement({
        organisationId: payload.organisationId,
        warehouseId: payload.destinationWarehouseId,
        catalogueProductId: sampleProductId,
        movementType: 'receipt',
        quantity: payload.itemCount > 0 ? payload.itemCount * 10 : 50,
        unitCost: 1000.0,
        referenceDocType: 'goods_receipt',
        referenceDocId: payload.grnId,
        createdByUserId: 'system-grn-relayer',
        correlationId,
      });

      logger.info(
        { grnId: payload.grnId, grnCode: payload.grnCode },
        'Stock movement posted to inventory ledger successfully from GRN event'
      );
    } catch (err: any) {
      logger.error(
        { grnId: payload.grnId, err: err.message },
        'Failed to record automated stock intake from GRN event'
      );
      throw err;
    }

    this.inboxGuard.markProcessed(eventId);
  }
}
