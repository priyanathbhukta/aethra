// ==============================================================================
// AETHRA Quotation Service — Application Domain Service & Pricing Snapshot
// ==============================================================================

import crypto from 'node:crypto';
import { Kysely } from 'kysely';
import { QuotationDatabaseSchema } from '../database/connection.js';
import {
  KafkaTopics,
  createEventEnvelope,
  QuotationAcceptedEventPayload,
  QuotationIssuedEventPayload,
} from '@aethra/event-contracts';
import { createStructuredLogger } from '@aethra/observability';
import { CreateQuotationDto, QuotationLineItemInput } from '@aethra/api-contracts';

const logger = createStructuredLogger('quotation-service');

export interface CreateQuotationCommand extends CreateQuotationDto {
  organisationId: string;
  createdByUserId: string;
  correlationId: string;
}

export interface IssueRevisionCommand {
  organisationId: string;
  quotationId: string;
  revisionId: string;
  correlationId: string;
}

export interface CreateNewRevisionCommand {
  organisationId: string;
  quotationId: string;
  validDays?: number;
  lines: QuotationLineItemInput[];
  notesCustomer?: string;
  notesInternal?: string;
  createdByUserId: string;
  correlationId: string;
}

export interface AcceptQuotationCommand {
  organisationId: string;
  quotationId: string;
  revisionId: string;
  customerUserId: string;
  signatureType?: 'digital_click' | 'otp_verified' | 'signed_scan';
  signatureToken?: string;
  ipAddress: string;
  userAgent: string;
  correlationId: string;
}

export interface RejectQuotationCommand {
  organisationId: string;
  quotationId: string;
  revisionId: string;
  customerUserId: string;
  comments?: string;
  ipAddress: string;
  userAgent: string;
  correlationId: string;
}

export class QuotationApplicationService {
  constructor(private readonly db: Kysely<QuotationDatabaseSchema>) {}

  /**
   * Generates a new quotation with master record, initial Revision 1 (draft),
   * and line item pricing calculations.
   */
  async createQuotation(cmd: CreateQuotationCommand) {
    if (!cmd.lines || cmd.lines.length === 0) {
      throw new Error('Quotation must contain at least one line item');
    }

    const quotationId = crypto.randomUUID();
    const revisionId = crypto.randomUUID();
    const now = new Date();
    const validDays = cmd.validDays || 30;
    const validUntil = new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000);

    const year = now.getFullYear();
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const quotationNumber = `QT-${year}-${randSuffix}`;

    // Line totals computation
    let subtotal = 0;
    let totalTax = 0;
    const computedLines = cmd.lines.map((l, idx) => {
      const lineTotal = l.quantity * l.unitPrice;
      const taxRate = l.taxRatePercent !== undefined ? l.taxRatePercent : 13.8;
      const taxAmount = (lineTotal * taxRate) / 100;
      const netAmount = lineTotal + taxAmount;

      subtotal += lineTotal;
      totalTax += taxAmount;

      return {
        id: crypto.randomUUID(),
        order: idx + 1,
        ...l,
        taxRate,
        lineTotal,
        taxAmount,
        netAmount,
      };
    });

    const totalPayable = subtotal + totalTax;

    const result = await this.db.transaction().execute(async (trx) => {
      // 1. Create master quotation
      const quotation = await trx
        .insertInto('quotations')
        .values({
          id: quotationId,
          organisation_id: cmd.organisationId,
          quotation_number: quotationNumber,
          customer_id: cmd.customerId,
          property_id: cmd.propertyId || null,
          lead_id: cmd.leadId || null,
          engineering_estimate_id: cmd.engineeringEstimateId || null,
          title: cmd.title.trim(),
          current_active_revision_id: revisionId,
          accepted_revision_id: null,
          status: 'draft',
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // 2. Create Revision 1 (Draft)
      const revision = await trx
        .insertInto('quotation_revisions')
        .values({
          id: revisionId,
          quotation_id: quotationId,
          organisation_id: cmd.organisationId,
          revision_number: 1,
          status: 'draft',
          valid_until: validUntil,
          subtotal_amount: subtotal,
          total_discount_amount: 0,
          total_tax_amount: totalTax,
          total_payable_amount: totalPayable,
          estimated_subsidy_amount: 0,
          net_customer_cost: totalPayable,
          internal_estimated_cost: 0,
          internal_projected_margin: 0,
          notes_customer: null,
          notes_internal: null,
          created_by_user_id: cmd.createdByUserId,
          issued_at: null,
          created_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // 3. Create Quotation Lines
      for (const cl of computedLines) {
        await trx
          .insertInto('quotation_lines')
          .values({
            id: cl.id,
            revision_id: revisionId,
            organisation_id: cmd.organisationId,
            item_order: cl.order,
            line_type: cl.itemType,
            catalogue_product_id: cl.catalogueProductId || null,
            item_description: cl.itemDescription.trim(),
            quantity: cl.quantity,
            unit: cl.unit,
            unit_price: cl.unitPrice,
            line_total: cl.lineTotal,
            discount_amount: 0,
            tax_rate_percent: cl.taxRate,
            tax_amount: cl.taxAmount,
            net_amount: cl.netAmount,
            created_at: now,
          })
          .execute();
      }

      return { quotation, revision, lines: computedLines };
    });

    logger.info(
      { quotationId: result.quotation.id, number: result.quotation.quotation_number, total: totalPayable },
      'Quotation draft and Revision 1 created'
    );

    return result;
  }

  /**
   * Issues a quotation revision to the customer.
   * Freezes the revision forever and dispatches quotation.issued.v1 event.
   */
  async issueQuotationRevision(cmd: IssueRevisionCommand) {
    const revision = await this.db
      .selectFrom('quotation_revisions')
      .selectAll()
      .where('id', '=', cmd.revisionId)
      .where('quotation_id', '=', cmd.quotationId)
      .where('organisation_id', '=', cmd.organisationId)
      .executeTakeFirst();

    if (!revision) {
      throw new Error(`Quotation revision '${cmd.revisionId}' not found`);
    }

    if (revision.status !== 'draft') {
      throw new Error(`Cannot issue revision: Revision is currently in '${revision.status}' status (must be draft)`);
    }

    const quot = await this.db
      .selectFrom('quotations')
      .selectAll()
      .where('id', '=', cmd.quotationId)
      .executeTakeFirstOrThrow();

    const now = new Date();

    const issued = await this.db.transaction().execute(async (trx) => {
      // 1. Freeze revision
      const rev = await trx
        .updateTable('quotation_revisions')
        .set({
          status: 'issued',
          issued_at: now,
        })
        .where('id', '=', revision.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      // 2. Set quotation status to issued
      await trx
        .updateTable('quotations')
        .set({
          status: 'issued',
          current_active_revision_id: revision.id,
          updated_at: now,
        })
        .where('id', '=', quot.id)
        .execute();

      // 3. Outbox Event
      const outboxPayload: QuotationIssuedEventPayload = {
        quotationId: quot.id,
        revisionId: rev.id,
        organisationId: cmd.organisationId,
        quotationNumber: quot.quotation_number,
        revisionNumber: rev.revision_number,
        customerId: quot.customer_id,
        propertyId: quot.property_id || undefined,
        totalPayableAmount: Number(rev.total_payable_amount),
        validUntil: rev.valid_until.toISOString(),
        issuedAt: now.toISOString(),
      };

      const envelope = createEventEnvelope(
        KafkaTopics.QUOTATION_ISSUED,
        'aethra-quotation-service',
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
          topic: KafkaTopics.QUOTATION_ISSUED,
          partition_key: cmd.organisationId,
          payload: envelope as unknown as Record<string, unknown>,
          correlation_id: cmd.correlationId,
          status: 'pending',
          retry_count: 0,
          created_at: now,
        })
        .execute();

      return rev;
    });

    logger.info({ quotationId: cmd.quotationId, revisionId: cmd.revisionId }, 'Quotation revision frozen and issued');
    return issued;
  }

  /**
   * Creates a new Revision n + 1 for an existing quotation.
   * Preserves previous revision immutability.
   */
  async createQuotationRevision(cmd: CreateNewRevisionCommand) {
    const quot = await this.db
      .selectFrom('quotations')
      .selectAll()
      .where('id', '=', cmd.quotationId)
      .where('organisation_id', '=', cmd.organisationId)
      .executeTakeFirst();

    if (!quot) {
      throw new Error(`Quotation '${cmd.quotationId}' not found`);
    }

    if (quot.status === 'accepted') {
      throw new Error('Cannot create new revisions on an already accepted quotation');
    }

    // Find latest revision number
    const latestRev = await this.db
      .selectFrom('quotation_revisions')
      .selectAll()
      .where('quotation_id', '=', cmd.quotationId)
      .orderBy('revision_number', 'desc')
      .executeTakeFirst();

    const nextRevisionNumber = latestRev ? latestRev.revision_number + 1 : 2;
    const revisionId = crypto.randomUUID();
    const now = new Date();
    const validDays = cmd.validDays || 30;
    const validUntil = new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000);

    let subtotal = 0;
    let totalTax = 0;
    const computedLines = cmd.lines.map((l, idx) => {
      const lineTotal = l.quantity * l.unitPrice;
      const taxRate = l.taxRatePercent !== undefined ? l.taxRatePercent : 13.8;
      const taxAmount = (lineTotal * taxRate) / 100;
      const netAmount = lineTotal + taxAmount;

      subtotal += lineTotal;
      totalTax += taxAmount;

      return {
        id: crypto.randomUUID(),
        order: idx + 1,
        ...l,
        taxRate,
        lineTotal,
        taxAmount,
        netAmount,
      };
    });

    const totalPayable = subtotal + totalTax;

    const newRev = await this.db.transaction().execute(async (trx) => {
      const rev = await trx
        .insertInto('quotation_revisions')
        .values({
          id: revisionId,
          quotation_id: cmd.quotationId,
          organisation_id: cmd.organisationId,
          revision_number: nextRevisionNumber,
          status: 'draft',
          valid_until: validUntil,
          subtotal_amount: subtotal,
          total_discount_amount: 0,
          total_tax_amount: totalTax,
          total_payable_amount: totalPayable,
          estimated_subsidy_amount: 0,
          net_customer_cost: totalPayable,
          internal_estimated_cost: 0,
          internal_projected_margin: 0,
          notes_customer: cmd.notesCustomer || null,
          notes_internal: cmd.notesInternal || null,
          created_by_user_id: cmd.createdByUserId,
          issued_at: null,
          created_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      for (const cl of computedLines) {
        await trx
          .insertInto('quotation_lines')
          .values({
            id: cl.id,
            revision_id: revisionId,
            organisation_id: cmd.organisationId,
            item_order: cl.order,
            line_type: cl.itemType,
            catalogue_product_id: cl.catalogueProductId || null,
            item_description: cl.itemDescription.trim(),
            quantity: cl.quantity,
            unit: cl.unit,
            unit_price: cl.unitPrice,
            line_total: cl.lineTotal,
            discount_amount: 0,
            tax_rate_percent: cl.taxRate,
            tax_amount: cl.taxAmount,
            net_amount: cl.netAmount,
            created_at: now,
          })
          .execute();
      }

      await trx
        .updateTable('quotations')
        .set({
          current_active_revision_id: revisionId,
          updated_at: now,
        })
        .where('id', '=', cmd.quotationId)
        .execute();

      return rev;
    });

    logger.info({ quotationId: cmd.quotationId, revisionNumber: nextRevisionNumber }, 'Created new quotation revision');
    return { revision: newRev, lines: computedLines };
  }

  /**
   * Customer accepts quotation.
   * Freezes acceptance, updates quotation, and emits quotation.accepted.v1 saga trigger.
   */
  async acceptQuotation(cmd: AcceptQuotationCommand) {
    const revision = await this.db
      .selectFrom('quotation_revisions')
      .selectAll()
      .where('id', '=', cmd.revisionId)
      .where('quotation_id', '=', cmd.quotationId)
      .where('organisation_id', '=', cmd.organisationId)
      .executeTakeFirst();

    if (!revision) {
      throw new Error(`Quotation revision '${cmd.revisionId}' not found`);
    }

    if (revision.status !== 'issued') {
      throw new Error(`Cannot accept revision: Revision must be in 'issued' status (current: '${revision.status}')`);
    }

    const quot = await this.db
      .selectFrom('quotations')
      .selectAll()
      .where('id', '=', cmd.quotationId)
      .executeTakeFirstOrThrow();

    const now = new Date();
    const responseId = crypto.randomUUID();

    await this.db.transaction().execute(async (trx) => {
      // 1. Audit customer acceptance response
      await trx
        .insertInto('customer_responses')
        .values({
          id: responseId,
          quotation_id: cmd.quotationId,
          revision_id: cmd.revisionId,
          organisation_id: cmd.organisationId,
          customer_user_id: cmd.customerUserId,
          decision: 'accept',
          customer_comments: null,
          signature_type: cmd.signatureType || 'digital_click',
          signature_verification_token: cmd.signatureToken || null,
          ip_address: cmd.ipAddress,
          user_agent: cmd.userAgent,
          responded_at: now,
        })
        .execute();

      // 2. Mark revision accepted
      await trx
        .updateTable('quotation_revisions')
        .set({
          status: 'accepted',
        })
        .where('id', '=', revision.id)
        .execute();

      // 3. Mark quotation accepted and point accepted_revision_id
      await trx
        .updateTable('quotations')
        .set({
          status: 'accepted',
          accepted_revision_id: revision.id,
          updated_at: now,
        })
        .where('id', '=', quot.id)
        .execute();

      // 4. Outbox Event (Quotation Accepted -> Triggers Downstream Saga)
      const outboxPayload: QuotationAcceptedEventPayload = {
        quotationId: quot.id,
        quotationNumber: quot.quotation_number,
        revisionNumber: revision.revision_number,
        revisionId: revision.id,
        organisationId: cmd.organisationId,
        customerId: quot.customer_id,
        propertyId: quot.property_id || undefined,
        totalPayableAmount: Number(revision.total_payable_amount),
        acceptedByUserId: cmd.customerUserId,
        acceptedAt: now.toISOString(),
      };

      const envelope = createEventEnvelope(
        KafkaTopics.QUOTATION_ACCEPTED,
        'aethra-quotation-service',
        {
          organisationId: cmd.organisationId,
          originatingUserId: cmd.customerUserId,
          correlationId: cmd.correlationId,
        },
        outboxPayload
      );

      await trx
        .insertInto('outbox_events')
        .values({
          id: crypto.randomUUID(),
          event_type: envelope.eventType,
          topic: KafkaTopics.QUOTATION_ACCEPTED,
          partition_key: cmd.organisationId,
          payload: envelope as unknown as Record<string, unknown>,
          correlation_id: cmd.correlationId,
          status: 'pending',
          retry_count: 0,
          created_at: now,
        })
        .execute();
    });

    logger.info(
      { quotationId: cmd.quotationId, revisionId: cmd.revisionId, customerId: quot.customer_id },
      'Quotation revision accepted and saga event dispatched'
    );
  }

  /**
   * Asserts immutability rule: Checks whether a revision is editable (status must be 'draft').
   */
  assertRevisionEditable(status: string) {
    if (status !== 'draft') {
      throw new Error(`CANNOT_MODIFY_FROZEN_REVISION: Revisions in status '${status}' are frozen and cannot be modified`);
    }
  }

  /**
   * Retrieves quotation master with active revision and line items.
   */
  async getQuotationById(organisationId: string, quotationId: string) {
    const quotation = await this.db
      .selectFrom('quotations')
      .selectAll()
      .where('id', '=', quotationId)
      .where('organisation_id', '=', organisationId)
      .executeTakeFirst();

    if (!quotation) return null;

    const revision = await this.db
      .selectFrom('quotation_revisions')
      .selectAll()
      .where('id', '=', quotation.current_active_revision_id || '')
      .executeTakeFirst();

    const lines = revision
      ? await this.db
          .selectFrom('quotation_lines')
          .selectAll()
          .where('revision_id', '=', revision.id)
          .orderBy('item_order', 'asc')
          .execute()
      : [];

    return {
      ...quotation,
      activeRevision: revision || null,
      lines,
    };
  }
}
