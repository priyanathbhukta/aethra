// ==============================================================================
// AETHRA Inventory Service — Application Service & Double-Entry Ledger
// ==============================================================================

import crypto from 'node:crypto';
import { Kysely } from 'kysely';
import { InventoryDatabaseSchema } from '../database/connection.js';
import {
  KafkaTopics,
  createEventEnvelope,
  StockReceivedEventPayload,
  StockReservedEventPayload,
  StockIssuedEventPayload,
} from '@aethra/event-contracts';
import { createStructuredLogger } from '@aethra/observability';
import { PostStockMovementDto } from '@aethra/api-contracts';

const logger = createStructuredLogger('inventory-service');

export interface PostMovementCommand extends PostStockMovementDto {
  organisationId: string;
  createdByUserId: string;
  correlationId: string;
}

export interface ReserveStockCommand {
  organisationId: string;
  warehouseId: string;
  catalogueProductId: string;
  projectId: string;
  quantity: number;
  correlationId: string;
}

export interface RegisterWarehouseCommand {
  organisationId: string;
  warehouseCode: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
}

export class InventoryApplicationService {
  constructor(private readonly db: Kysely<InventoryDatabaseSchema>) {}

  /**
   * Registers a new warehouse for the vendor organisation.
   */
  async registerWarehouse(cmd: RegisterWarehouseCommand) {
    const warehouseId = crypto.randomUUID();
    const now = new Date();

    const warehouse = await this.db
      .insertInto('warehouses')
      .values({
        id: warehouseId,
        organisation_id: cmd.organisationId,
        warehouse_code: cmd.warehouseCode.trim().toUpperCase(),
        name: cmd.name.trim(),
        address: cmd.address.trim(),
        city: cmd.city.trim(),
        state: cmd.state.trim(),
        postal_code: cmd.postalCode.trim(),
        is_active: true,
        created_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    logger.info({ warehouseId: warehouse.id, code: warehouse.warehouse_code }, 'Warehouse registered');
    return warehouse;
  }

  /**
   * Concurrency-safe, append-only stock movement posting with Negative Stock Guard.
   */
  async postStockMovement(cmd: PostMovementCommand) {
    if (cmd.quantity <= 0) {
      throw new Error('Movement quantity must be greater than zero');
    }

    const isOutflow = ['issue', 'transfer_out', 'adjustment_negative'].includes(cmd.movementType);
    const quantityDelta = isOutflow ? -cmd.quantity : cmd.quantity;
    const now = new Date();
    const ledgerEntryId = crypto.randomUUID();

    const result = await this.db.transaction().execute(async (trx) => {
      // 1. Lock existing balance row with SELECT ... FOR UPDATE
      const balance = await trx
        .selectFrom('stock_balances')
        .selectAll()
        .where('organisation_id', '=', cmd.organisationId)
        .where('warehouse_id', '=', cmd.warehouseId)
        .where('catalogue_product_id', '=', cmd.catalogueProductId)
        .forUpdate()
        .executeTakeFirst();

      const currentOnHand = balance ? Number(balance.on_hand_quantity) : 0;
      const currentReserved = balance ? Number(balance.reserved_quantity) : 0;
      const currentAvailable = currentOnHand - currentReserved;

      // 2. Negative Stock Guard (Scenario 9)
      if (isOutflow && currentAvailable < cmd.quantity) {
        throw new Error(
          `INSUFFICIENT_STOCK: Transaction causes negative available balance (Available: ${currentAvailable}, Requested: ${cmd.quantity})`
        );
      }

      const newOnHand = currentOnHand + quantityDelta;
      const newAvailable = newOnHand - currentReserved;

      // Weighted moving average unit cost computation on inflow
      let newAverageCost = balance ? Number(balance.average_unit_cost) : 0;
      if (!isOutflow && newOnHand > 0) {
        const existingValue = currentOnHand * newAverageCost;
        const incomingValue = cmd.quantity * cmd.unitCost;
        newAverageCost = Number(((existingValue + incomingValue) / newOnHand).toFixed(2));
      }

      const totalCost = Number((Math.abs(quantityDelta) * cmd.unitCost).toFixed(2));

      // 3. Upsert Stock Balance snapshot
      let updatedBalance: any;
      if (!balance) {
        updatedBalance = await trx
          .insertInto('stock_balances')
          .values({
            id: crypto.randomUUID(),
            organisation_id: cmd.organisationId,
            warehouse_id: cmd.warehouseId,
            catalogue_product_id: cmd.catalogueProductId,
            on_hand_quantity: newOnHand,
            reserved_quantity: currentReserved,
            available_quantity: newAvailable,
            average_unit_cost: newAverageCost,
            last_movement_at: now,
            updated_at: now,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
      } else {
        updatedBalance = await trx
          .updateTable('stock_balances')
          .set({
            on_hand_quantity: newOnHand,
            available_quantity: newAvailable,
            average_unit_cost: newAverageCost,
            last_movement_at: now,
            updated_at: now,
          })
          .where('id', '=', balance.id)
          .returningAll()
          .executeTakeFirstOrThrow();
      }

      // 4. Append-Only Stock Ledger Entry
      const ledgerEntry = await trx
        .insertInto('stock_ledger_entries')
        .values({
          id: ledgerEntryId,
          organisation_id: cmd.organisationId,
          warehouse_id: cmd.warehouseId,
          catalogue_product_id: cmd.catalogueProductId,
          movement_type: cmd.movementType,
          quantity: quantityDelta,
          unit_cost: cmd.unitCost,
          total_cost: totalCost,
          balance_after: newOnHand,
          reference_doc_type: cmd.referenceDocType,
          reference_doc_id: cmd.referenceDocId,
          batch_id: null,
          created_by_user_id: cmd.createdByUserId,
          posted_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // 5. Transactional Outbox Event
      if (cmd.movementType === 'receipt') {
        const outboxPayload: StockReceivedEventPayload = {
          receiptId: ledgerEntryId,
          receiptCode: `REC-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
          organisationId: cmd.organisationId,
          warehouseId: cmd.warehouseId,
          catalogueProductId: cmd.catalogueProductId,
          quantity: cmd.quantity,
          unitCost: cmd.unitCost,
          receivedAt: now.toISOString(),
        };

        const envelope = createEventEnvelope(
          KafkaTopics.INVENTORY_STOCK_RECEIVED,
          'aethra-inventory-service',
          {
            organisationId: cmd.organisationId,
            correlationId: cmd.correlationId,
          },
          outboxPayload
        );

        await trx
          .insertInto('outbox_events')
          .values({
            id: crypto.randomUUID(),
            event_type: envelope.eventType,
            topic: KafkaTopics.INVENTORY_STOCK_RECEIVED,
            partition_key: cmd.organisationId,
            payload: envelope as unknown as Record<string, unknown>,
            correlation_id: cmd.correlationId,
            status: 'pending',
            retry_count: 0,
            created_at: now,
          })
          .execute();
      } else if (cmd.movementType === 'issue') {
        const outboxPayload: StockIssuedEventPayload = {
          issueId: ledgerEntryId,
          issueCode: `ISS-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
          organisationId: cmd.organisationId,
          warehouseId: cmd.warehouseId,
          catalogueProductId: cmd.catalogueProductId,
          quantity: cmd.quantity,
          issuedToUserId: cmd.createdByUserId,
          issuedAt: now.toISOString(),
        };

        const envelope = createEventEnvelope(
          KafkaTopics.INVENTORY_STOCK_ISSUED,
          'aethra-inventory-service',
          {
            organisationId: cmd.organisationId,
            correlationId: cmd.correlationId,
          },
          outboxPayload
        );

        await trx
          .insertInto('outbox_events')
          .values({
            id: crypto.randomUUID(),
            event_type: envelope.eventType,
            topic: KafkaTopics.INVENTORY_STOCK_ISSUED,
            partition_key: cmd.organisationId,
            payload: envelope as unknown as Record<string, unknown>,
            correlation_id: cmd.correlationId,
            status: 'pending',
            retry_count: 0,
            created_at: now,
          })
          .execute();
      }

      return { balance: updatedBalance, ledgerEntry };
    });

    logger.info(
      { ledgerEntryId, warehouseId: cmd.warehouseId, product: cmd.catalogueProductId, delta: quantityDelta },
      'Stock movement posted successfully'
    );

    return result;
  }

  /**
   * Earmarks stock in a warehouse for an active project.
   */
  async reserveStock(cmd: ReserveStockCommand) {
    if (cmd.quantity <= 0) {
      throw new Error('Reservation quantity must be greater than zero');
    }

    const now = new Date();
    const reservationId = crypto.randomUUID();

    const reservation = await this.db.transaction().execute(async (trx) => {
      // 1. Lock stock balance
      const balance = await trx
        .selectFrom('stock_balances')
        .selectAll()
        .where('organisation_id', '=', cmd.organisationId)
        .where('warehouse_id', '=', cmd.warehouseId)
        .where('catalogue_product_id', '=', cmd.catalogueProductId)
        .forUpdate()
        .executeTakeFirst();

      const onHand = balance ? Number(balance.on_hand_quantity) : 0;
      const reserved = balance ? Number(balance.reserved_quantity) : 0;
      const available = onHand - reserved;

      if (available < cmd.quantity) {
        throw new Error(
          `INSUFFICIENT_STOCK: Cannot reserve ${cmd.quantity} units; only ${available} available on hand`
        );
      }

      const newReserved = reserved + cmd.quantity;
      const newAvailable = onHand - newReserved;

      // 2. Update stock balance
      await trx
        .updateTable('stock_balances')
        .set({
          reserved_quantity: newReserved,
          available_quantity: newAvailable,
          updated_at: now,
        })
        .where('id', '=', balance!.id)
        .execute();

      // 3. Create reservation record
      const res = await trx
        .insertInto('stock_reservations')
        .values({
          id: reservationId,
          organisation_id: cmd.organisationId,
          warehouse_id: cmd.warehouseId,
          catalogue_product_id: cmd.catalogueProductId,
          project_id: cmd.projectId,
          quantity_reserved: cmd.quantity,
          quantity_fulfilled: 0,
          status: 'active',
          expires_at: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000), // 60 days
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // 4. Outbox Event
      const outboxPayload: StockReservedEventPayload = {
        reservationId: res.id,
        organisationId: cmd.organisationId,
        warehouseId: cmd.warehouseId,
        catalogueProductId: cmd.catalogueProductId,
        projectId: cmd.projectId,
        quantityReserved: cmd.quantity,
        reservedAt: now.toISOString(),
      };

      const envelope = createEventEnvelope(
        KafkaTopics.INVENTORY_STOCK_RESERVED,
        'aethra-inventory-service',
        {
          organisationId: cmd.organisationId,
          correlationId: cmd.correlationId,
        },
        outboxPayload
      );

      await trx
        .insertInto('outbox_events')
        .values({
          id: crypto.randomUUID(),
          event_type: envelope.eventType,
          topic: KafkaTopics.INVENTORY_STOCK_RESERVED,
          partition_key: cmd.organisationId,
          payload: envelope as unknown as Record<string, unknown>,
          correlation_id: cmd.correlationId,
          status: 'pending',
          retry_count: 0,
          created_at: now,
        })
        .execute();

      return res;
    });

    logger.info({ reservationId, project: cmd.projectId, qty: cmd.quantity }, 'Stock reserved for project');
    return reservation;
  }

  /**
   * Retrieves stock balance for a warehouse and product.
   */
  async getStockBalance(organisationId: string, warehouseId: string, catalogueProductId: string) {
    return await this.db
      .selectFrom('stock_balances')
      .selectAll()
      .where('organisation_id', '=', organisationId)
      .where('warehouse_id', '=', warehouseId)
      .where('catalogue_product_id', '=', catalogueProductId)
      .executeTakeFirst();
  }

  /**
   * Lists stock balances in a warehouse.
   */
  async listBalances(organisationId: string, warehouseId?: string) {
    let query = this.db
      .selectFrom('stock_balances')
      .selectAll()
      .where('organisation_id', '=', organisationId);

    if (warehouseId) {
      query = query.where('warehouse_id', '=', warehouseId);
    }

    return await query.orderBy('updated_at', 'desc').execute();
  }
}
