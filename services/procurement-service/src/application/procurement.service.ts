// ==============================================================================
// AETHRA Procurement Service — Application Domain Service & 3-Way Matching
// ==============================================================================

import crypto from 'node:crypto';
import { Kysely } from 'kysely';
import { ProcurementDatabaseSchema } from '../database/connection.js';
import {
  KafkaTopics,
  createEventEnvelope,
  GoodsReceiptConfirmedEventPayload,
} from '@aethra/event-contracts';
import { createStructuredLogger } from '@aethra/observability';
import {
  CreateSupplierDto,
  CreatePurchaseOrderDto,
  RecordGoodsReceiptDto,
} from '@aethra/api-contracts';

const logger = createStructuredLogger('procurement-service');

export interface CreateSupplierCommand extends CreateSupplierDto {
  organisationId: string;
}

export interface CreatePurchaseOrderCommand extends CreatePurchaseOrderDto {
  organisationId: string;
  createdByUserId: string;
  correlationId: string;
}

export interface RecordGoodsReceiptCommand extends RecordGoodsReceiptDto {
  organisationId: string;
  inspectedByUserId: string;
  correlationId: string;
}

export class ProcurementApplicationService {
  constructor(private readonly db: Kysely<ProcurementDatabaseSchema>) {}

  /**
   * Registers a new equipment/services supplier.
   */
  async createSupplier(cmd: CreateSupplierCommand) {
    const supplierId = crypto.randomUUID();
    const now = new Date();
    const year = now.getFullYear();
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const supplierCode = cmd.supplierCode || `SUP-${year}-${randSuffix}`;

    const supplier = await this.db
      .insertInto('suppliers')
      .values({
        id: supplierId,
        organisation_id: cmd.organisationId,
        supplier_code: supplierCode,
        legal_name: cmd.legalName.trim(),
        trade_name: cmd.tradeName ? cmd.tradeName.trim() : null,
        gst_number: cmd.gstNumber ? cmd.gstNumber.trim().toUpperCase() : null,
        pan_tax_id: cmd.panTaxId ? cmd.panTaxId.trim().toUpperCase() : null,
        contact_person: cmd.contactPerson.trim(),
        email: cmd.email.trim().toLowerCase(),
        phone: cmd.phone.trim(),
        address: cmd.address.trim(),
        city: cmd.city.trim(),
        state: cmd.state.trim(),
        postal_code: cmd.postalCode.trim(),
        payment_terms_default: cmd.paymentTermsDefault || 'net_30',
        is_active: true,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    logger.info({ supplierId: supplier.id, code: supplier.supplier_code }, 'Supplier registered');
    return supplier;
  }

  /**
   * Generates a purchase order with itemized lines, GST calculation, and totals.
   */
  async createPurchaseOrder(cmd: CreatePurchaseOrderCommand) {
    if (!cmd.lines || cmd.lines.length === 0) {
      throw new Error('Purchase order must contain at least one line item');
    }

    const poId = crypto.randomUUID();
    const now = new Date();
    const year = now.getFullYear();
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const poNumber = `PO-${year}-${randSuffix}`;

    let subtotal = 0;
    let totalTax = 0;

    const computedLines = cmd.lines.map((l) => {
      const lineTotal = l.orderedQuantity * l.unitPrice;
      const taxRate = l.taxRatePercent !== undefined ? l.taxRatePercent : 13.8;
      const taxAmount = (lineTotal * taxRate) / 100;

      subtotal += lineTotal;
      totalTax += taxAmount;

      return {
        id: crypto.randomUUID(),
        poId,
        ...l,
        taxRate,
        lineTotal,
        taxAmount,
      };
    });

    const totalAmount = subtotal + totalTax;

    const result = await this.db.transaction().execute(async (trx) => {
      // 1. Create Purchase Order header
      const po = await trx
        .insertInto('purchase_orders')
        .values({
          id: poId,
          organisation_id: cmd.organisationId,
          po_number: poNumber,
          supplier_id: cmd.supplierId,
          requisition_id: cmd.requisitionId || null,
          destination_warehouse_id: cmd.destinationWarehouseId,
          status: 'draft',
          order_date: now,
          expected_delivery_date: new Date(cmd.expectedDeliveryDate),
          subtotal_amount: subtotal,
          tax_amount: totalTax,
          total_amount: totalAmount,
          payment_terms: cmd.paymentTerms || 'net_30',
          shipping_terms: cmd.shippingTerms || 'fob_site',
          created_by_user_id: cmd.createdByUserId,
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // 2. Insert PO Lines
      for (const cl of computedLines) {
        await trx
          .insertInto('purchase_order_lines')
          .values({
            id: cl.id,
            po_id: poId,
            requisition_line_id: null,
            organisation_id: cmd.organisationId,
            catalogue_product_id: cl.catalogueProductId,
            item_description: cl.itemDescription.trim(),
            ordered_quantity: cl.orderedQuantity,
            received_quantity: 0,
            unit: cl.unit,
            unit_price: cl.unitPrice,
            tax_rate_percent: cl.taxRate,
            line_total: cl.lineTotal,
            created_at: now,
          })
          .execute();
      }

      return { po, lines: computedLines };
    });

    logger.info({ poId: result.po.id, poNumber: result.po.po_number, total: totalAmount }, 'Purchase order drafted');
    return result;
  }

  /**
   * Issues a Purchase Order to the supplier.
   */
  async issuePurchaseOrder(organisationId: string, poId: string) {
    const po = await this.db
      .selectFrom('purchase_orders')
      .selectAll()
      .where('id', '=', poId)
      .where('organisation_id', '=', organisationId)
      .executeTakeFirst();

    if (!po) {
      throw new Error(`Purchase order '${poId}' not found`);
    }

    if (po.status !== 'draft') {
      throw new Error(`Cannot issue purchase order in status '${po.status}'`);
    }

    const updated = await this.db
      .updateTable('purchase_orders')
      .set({
        status: 'issued',
        updated_at: new Date(),
      })
      .where('id', '=', poId)
      .returningAll()
      .executeTakeFirstOrThrow();

    logger.info({ poId, status: updated.status }, 'Purchase order issued');
    return updated;
  }

  /**
   * Finalizes goods receipt note (GRN).
   * Emits procurement.goods_receipt.confirmed.v1 which triggers downstream inventory intake!
   */
  async recordGoodsReceipt(cmd: RecordGoodsReceiptCommand) {
    const po = await this.db
      .selectFrom('purchase_orders')
      .selectAll()
      .where('id', '=', cmd.poId)
      .where('organisation_id', '=', cmd.organisationId)
      .executeTakeFirst();

    if (!po) {
      throw new Error(`Purchase order '${cmd.poId}' not found`);
    }

    if (!['issued', 'confirmed', 'partially_received'].includes(po.status)) {
      throw new Error(`Cannot receive goods for PO in status '${po.status}' (must be issued or confirmed)`);
    }

    const grnId = crypto.randomUUID();
    const now = new Date();
    const year = now.getFullYear();
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const grnCode = `GRN-${year}-${randSuffix}`;

    const result = await this.db.transaction().execute(async (trx) => {
      // 1. Insert Goods Receipt
      const grn = await trx
        .insertInto('goods_receipts')
        .values({
          id: grnId,
          organisation_id: cmd.organisationId,
          grn_code: grnCode,
          po_id: cmd.poId,
          supplier_id: cmd.supplierId,
          destination_warehouse_id: cmd.destinationWarehouseId,
          delivery_challan_number: cmd.deliveryChallanNumber.trim(),
          transporter_name: cmd.transporterName || null,
          vehicle_number: cmd.vehicleNumber || null,
          inspection_status: 'accepted',
          inspected_by_user_id: cmd.inspectedByUserId,
          received_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // 2. Insert GRN Lines & Update PO Lines received quantities
      for (const line of cmd.lines) {
        await trx
          .insertInto('goods_receipt_lines')
          .values({
            id: crypto.randomUUID(),
            goods_receipt_id: grnId,
            po_line_id: line.poLineId,
            organisation_id: cmd.organisationId,
            catalogue_product_id: line.catalogueProductId,
            quantity_delivered: line.quantityDelivered,
            quantity_accepted: line.quantityAccepted,
            quantity_rejected: line.quantityRejected || 0,
            rejection_reason: line.rejectionReason || null,
            batch_code: line.batchCode || null,
            serial_numbers: line.serialNumbers ? ({ serials: line.serialNumbers } as any) : null,
          })
          .execute();

        // Increment received quantity on PO line
        await trx
          .updateTable('purchase_order_lines')
          .set((eb) => ({
            received_quantity: eb('received_quantity', '+', line.quantityAccepted),
          }))
          .where('id', '=', line.poLineId)
          .execute();
      }

      // 3. Update PO status
      const allLines = await trx
        .selectFrom('purchase_order_lines')
        .selectAll()
        .where('po_id', '=', cmd.poId)
        .execute();

      const allReceived = allLines.every((l) => Number(l.received_quantity) >= Number(l.ordered_quantity));
      const newPoStatus = allReceived ? 'fully_received' : 'partially_received';

      await trx
        .updateTable('purchase_orders')
        .set({
          status: newPoStatus,
          updated_at: now,
        })
        .where('id', '=', cmd.poId)
        .execute();

      // 4. Outbox Event (triggers downstream inventory intake)
      const outboxPayload: GoodsReceiptConfirmedEventPayload = {
        grnId,
        grnCode,
        organisationId: cmd.organisationId,
        poId: cmd.poId,
        supplierId: cmd.supplierId,
        destinationWarehouseId: cmd.destinationWarehouseId,
        deliveryChallanNumber: cmd.deliveryChallanNumber,
        itemCount: cmd.lines.length,
        receivedAt: now.toISOString(),
      };

      const envelope = createEventEnvelope(
        KafkaTopics.PROCUREMENT_GOODS_RECEIPT_CONFIRMED,
        'aethra-procurement-service',
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
          topic: KafkaTopics.PROCUREMENT_GOODS_RECEIPT_CONFIRMED,
          partition_key: cmd.organisationId,
          payload: envelope as unknown as Record<string, unknown>,
          correlation_id: cmd.correlationId,
          status: 'pending',
          retry_count: 0,
          created_at: now,
        })
        .execute();

      return { grn, poStatus: newPoStatus };
    });

    logger.info({ grnId, poId: cmd.poId, status: result.poStatus }, 'Goods receipt confirmed and outbox event emitted');
    return result;
  }

  /**
   * 3-Way Matching Audit: Compares PO Total, Goods Receipt Accepted Value, and Supplier Invoice Amount.
   */
  async auditThreeWayMatching(organisationId: string, poId: string, supplierInvoiceAmount: number) {
    const po = await this.db
      .selectFrom('purchase_orders')
      .selectAll()
      .where('id', '=', poId)
      .where('organisation_id', '=', organisationId)
      .executeTakeFirst();

    if (!po) {
      throw new Error(`Purchase order '${poId}' not found`);
    }

    const grns = await this.db
      .selectFrom('goods_receipts')
      .innerJoin('goods_receipt_lines', 'goods_receipts.id', 'goods_receipt_lines.goods_receipt_id')
      .innerJoin('purchase_order_lines', 'goods_receipt_lines.po_line_id', 'purchase_order_lines.id')
      .select([
        'goods_receipt_lines.quantity_accepted',
        'purchase_order_lines.unit_price',
        'purchase_order_lines.tax_rate_percent',
      ])
      .where('goods_receipts.po_id', '=', poId)
      .where('goods_receipts.organisation_id', '=', organisationId)
      .execute();

    let acceptedMaterialValue = 0;
    for (const g of grns) {
      const lineSubtotal = Number(g.quantity_accepted) * Number(g.unit_price);
      const lineTax = (lineSubtotal * Number(g.tax_rate_percent)) / 100;
      acceptedMaterialValue += lineSubtotal + lineTax;
    }

    const poTotal = Number(po.total_amount);
    const invoiceVariance = Math.abs(supplierInvoiceAmount - acceptedMaterialValue);
    const percentageVariance = acceptedMaterialValue > 0 ? (invoiceVariance / acceptedMaterialValue) * 100 : 0;

    // Tolerance limit: 1.0% variance allowed for freight/round-off
    const isMatched = percentageVariance <= 1.0;

    return {
      poId,
      poNumber: po.po_number,
      poTotalAmount: poTotal,
      acceptedMaterialValue: Number(acceptedMaterialValue.toFixed(2)),
      supplierInvoiceAmount,
      varianceAmount: Number(invoiceVariance.toFixed(2)),
      percentageVariance: Number(percentageVariance.toFixed(2)),
      isMatched,
      status: isMatched ? 'verified_match' : 'discrepancy_flagged',
    };
  }

  /**
   * Retrieves PO with its line items.
   */
  async getPurchaseOrderById(organisationId: string, poId: string) {
    const po = await this.db
      .selectFrom('purchase_orders')
      .selectAll()
      .where('id', '=', poId)
      .where('organisation_id', '=', organisationId)
      .executeTakeFirst();

    if (!po) return null;

    const lines = await this.db
      .selectFrom('purchase_order_lines')
      .selectAll()
      .where('po_id', '=', poId)
      .execute();

    return { ...po, lines };
  }
}
