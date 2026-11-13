// ==============================================================================
// AETHRA CRM Service — Application Domain Service
// ==============================================================================

import crypto from 'node:crypto';
import { Kysely } from 'kysely';
import { CrmDatabaseSchema } from '../database/connection.js';
import {
  KafkaTopics,
  createEventEnvelope,
  CrmLeadConvertedEventPayload,
} from '@aethra/event-contracts';
import { createStructuredLogger } from '@aethra/observability';
import { CreateLeadDto } from '@aethra/api-contracts';

const logger = createStructuredLogger('crm-service');

export interface CreateLeadCommand extends CreateLeadDto {
  organisationId: string;
  createdByUserId?: string;
  correlationId: string;
}

export interface AssignLeadCommand {
  organisationId: string;
  leadId: string;
  assignedToUserId: string;
  assignedByUserId: string;
  assignmentNotes?: string;
}

export interface UpdateLeadStageCommand {
  organisationId: string;
  leadId: string;
  stageId: string;
  performedByUserId: string;
  notes?: string;
}

export interface LogInteractionCommand {
  organisationId: string;
  leadId: string;
  channel: 'phone_call' | 'whatsapp' | 'email' | 'in_person';
  direction?: 'inbound' | 'outbound';
  durationSeconds?: number;
  summary: string;
  outcome?: string;
  recordedByUserId: string;
}

export interface ConvertLeadCommand {
  organisationId: string;
  leadId: string;
  customerId?: string;
  quotationId?: string;
  convertedByUserId: string;
  conversionType?: 'customer_only' | 'customer_and_quote' | 'direct_project';
  correlationId: string;
}

export class CrmApplicationService {
  constructor(private readonly db: Kysely<CrmDatabaseSchema>) {}

  /**
   * Captures a new lead with tenant deduplication and human-readable lead code generation.
   */
  async createLead(cmd: CreateLeadCommand) {
    const existing = await this.db
      .selectFrom('leads')
      .selectAll()
      .where('organisation_id', '=', cmd.organisationId)
      .where('prospect_phone', '=', cmd.prospectPhone.trim())
      .executeTakeFirst();

    if (existing) {
      throw new Error(`CONFLICT: Lead with phone ${cmd.prospectPhone} already exists in this organisation (${existing.lead_code})`);
    }

    // Ensure a default initial stage exists
    let initialStage = await this.db
      .selectFrom('lead_stages')
      .selectAll()
      .where('organisation_id', '=', cmd.organisationId)
      .orderBy('stage_order', 'asc')
      .executeTakeFirst();

    if (!initialStage) {
      // Seed default pipeline stages for tenant
      const defaultStages = [
        { name: 'New Lead', order: 1, isWon: false, isLost: false },
        { name: 'Contacted', order: 2, isWon: false, isLost: false },
        { name: 'Site Audit Scheduled', order: 3, isWon: false, isLost: false },
        { name: 'Proposal Sent', order: 4, isWon: false, isLost: false },
        { name: 'Won / Customer Converted', order: 5, isWon: true, isLost: false },
        { name: 'Disqualified / Lost', order: 6, isWon: false, isLost: true },
      ];

      for (const st of defaultStages) {
        const id = crypto.randomUUID();
        await this.db
          .insertInto('lead_stages')
          .values({
            id,
            organisation_id: cmd.organisationId,
            name: st.name,
            stage_order: st.order,
            is_won: st.isWon,
            is_lost: st.isLost,
            is_active: true,
            created_at: new Date(),
          })
          .execute();
      }

      initialStage = await this.db
        .selectFrom('lead_stages')
        .selectAll()
        .where('organisation_id', '=', cmd.organisationId)
        .orderBy('stage_order', 'asc')
        .executeTakeFirstOrThrow();
    }

    const leadId = crypto.randomUUID();
    const now = new Date();
    const year = now.getFullYear();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const leadCode = `LD-${year}-${randomSuffix}`;

    const lead = await this.db.transaction().execute(async (trx) => {
      const createdLead = await trx
        .insertInto('leads')
        .values({
          id: leadId,
          organisation_id: cmd.organisationId,
          lead_code: leadCode,
          lead_source_id: cmd.leadSourceId || null,
          current_stage_id: initialStage.id,
          prospect_name: cmd.prospectName.trim(),
          prospect_phone: cmd.prospectPhone.trim(),
          prospect_email: cmd.prospectEmail ? cmd.prospectEmail.toLowerCase().trim() : null,
          prospect_type: cmd.prospectType || 'residential',
          site_address: null,
          site_city: cmd.siteCity ? cmd.siteCity.trim() : null,
          site_state: cmd.siteState ? cmd.siteState.trim() : null,
          site_postal_code: null,
          estimated_monthly_bill: null,
          proposed_capacity_kw: cmd.proposedCapacityKw || null,
          budget_estimate: null,
          priority: 'medium',
          status: 'open',
          assigned_agent_user_id: null,
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Log initial activity
      await trx
        .insertInto('lead_activities')
        .values({
          id: crypto.randomUUID(),
          organisation_id: cmd.organisationId,
          lead_id: leadId,
          activity_type: 'note_added',
          title: 'Lead Captured',
          description: `Captured prospect: ${cmd.prospectName} (${cmd.prospectPhone})`,
          performed_by_user_id: cmd.createdByUserId || 'system',
          metadata: { initialStage: initialStage.name },
          created_at: now,
        })
        .execute();

      return createdLead;
    });

    logger.info({ leadId: lead.id, leadCode: lead.lead_code, orgId: cmd.organisationId }, 'Lead created successfully');
    return lead;
  }

  /**
   * Assigns a sales agent to a lead.
   */
  async assignLead(cmd: AssignLeadCommand) {
    const now = new Date();
    const assignmentId = crypto.randomUUID();

    const result = await this.db.transaction().execute(async (trx) => {
      // 1. Audit assignment
      await trx
        .insertInto('lead_assignments')
        .values({
          id: assignmentId,
          organisation_id: cmd.organisationId,
          lead_id: cmd.leadId,
          assigned_to_user_id: cmd.assignedToUserId,
          assigned_by_user_id: cmd.assignedByUserId,
          assignment_notes: cmd.assignmentNotes || null,
          assigned_at: now,
          unassigned_at: null,
        })
        .execute();

      // 2. Update lead assigned agent
      const updated = await trx
        .updateTable('leads')
        .set({
          assigned_agent_user_id: cmd.assignedToUserId,
          updated_at: now,
        })
        .where('id', '=', cmd.leadId)
        .where('organisation_id', '=', cmd.organisationId)
        .returningAll()
        .executeTakeFirstOrThrow();

      return updated;
    });

    logger.info({ leadId: cmd.leadId, agentId: cmd.assignedToUserId }, 'Lead assigned to sales agent');
    return result;
  }

  /**
   * Transitions a lead across pipeline stages.
   */
  async updateLeadStage(cmd: UpdateLeadStageCommand) {
    const stage = await this.db
      .selectFrom('lead_stages')
      .selectAll()
      .where('id', '=', cmd.stageId)
      .where('organisation_id', '=', cmd.organisationId)
      .executeTakeFirst();

    if (!stage) {
      throw new Error(`Pipeline stage '${cmd.stageId}' not found in organisation`);
    }

    const now = new Date();
    const newStatus = stage.is_won ? 'converted' : stage.is_lost ? 'disqualified' : 'open';

    const updated = await this.db.transaction().execute(async (trx) => {
      const lead = await trx
        .updateTable('leads')
        .set({
          current_stage_id: cmd.stageId,
          status: newStatus,
          updated_at: now,
        })
        .where('id', '=', cmd.leadId)
        .where('organisation_id', '=', cmd.organisationId)
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx
        .insertInto('lead_activities')
        .values({
          id: crypto.randomUUID(),
          organisation_id: cmd.organisationId,
          lead_id: cmd.leadId,
          activity_type: 'stage_change',
          title: `Stage Changed to ${stage.name}`,
          description: cmd.notes || null,
          performed_by_user_id: cmd.performedByUserId,
          metadata: { stageName: stage.name, status: newStatus },
          created_at: now,
        })
        .execute();

      return lead;
    });

    return updated;
  }

  /**
   * Logs a phone call, WhatsApp chat, or in-person prospect interaction.
   */
  async logInteraction(cmd: LogInteractionCommand) {
    const interactionId = crypto.randomUUID();
    const result = await this.db
      .insertInto('lead_interactions')
      .values({
        id: interactionId,
        organisation_id: cmd.organisationId,
        lead_id: cmd.leadId,
        channel: cmd.channel,
        direction: cmd.direction || 'outbound',
        duration_seconds: cmd.durationSeconds || null,
        summary: cmd.summary.trim(),
        outcome: cmd.outcome ? cmd.outcome.trim() : null,
        recorded_by_user_id: cmd.recordedByUserId,
        recorded_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return result;
  }

  /**
   * Converts a lead into a customer relationship / quotation.
   * Emits crm.lead.converted.v1 outbox event.
   */
  async convertLead(cmd: ConvertLeadCommand) {
    const lead = await this.db
      .selectFrom('leads')
      .selectAll()
      .where('id', '=', cmd.leadId)
      .where('organisation_id', '=', cmd.organisationId)
      .executeTakeFirst();

    if (!lead) {
      throw new Error(`Lead '${cmd.leadId}' not found in organisation`);
    }

    const conversionId = crypto.randomUUID();
    const now = new Date();

    const conversion = await this.db.transaction().execute(async (trx) => {
      // 1. Record conversion
      const rec = await trx
        .insertInto('lead_conversions')
        .values({
          id: conversionId,
          organisation_id: cmd.organisationId,
          lead_id: cmd.leadId,
          customer_id: cmd.customerId || null,
          quotation_id: cmd.quotationId || null,
          converted_by_user_id: cmd.convertedByUserId,
          conversion_type: cmd.conversionType || 'customer_and_quote',
          converted_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // 2. Mark lead status as converted
      await trx
        .updateTable('leads')
        .set({
          status: 'converted',
          updated_at: now,
        })
        .where('id', '=', cmd.leadId)
        .execute();

      // 3. Outbox Event
      const outboxPayload: CrmLeadConvertedEventPayload = {
        leadId: lead.id,
        organisationId: cmd.organisationId,
        leadCode: lead.lead_code,
        prospectName: lead.prospect_name,
        prospectPhone: lead.prospect_phone,
        prospectEmail: lead.prospect_email || undefined,
        customerId: cmd.customerId,
        quotationId: cmd.quotationId,
        convertedByUserId: cmd.convertedByUserId,
        convertedAt: now.toISOString(),
      };

      const envelope = createEventEnvelope(
        KafkaTopics.CRM_LEAD_CONVERTED,
        'aethra-crm-service',
        {
          organisationId: cmd.organisationId,
          originatingUserId: cmd.convertedByUserId,
          correlationId: cmd.correlationId,
        },
        outboxPayload
      );

      await trx
        .insertInto('outbox_events')
        .values({
          id: crypto.randomUUID(),
          event_type: envelope.eventType,
          topic: KafkaTopics.CRM_LEAD_CONVERTED,
          partition_key: cmd.organisationId,
          payload: envelope as unknown as Record<string, unknown>,
          correlation_id: cmd.correlationId,
          status: 'pending',
          retry_count: 0,
          created_at: now,
        })
        .execute();

      return rec;
    });

    logger.info({ leadId: lead.id, conversionId: conversion.id }, 'Lead converted and outbox event dispatched');
    return conversion;
  }

  /**
   * Retrieves paginated leads for a tenant with filtering.
   */
  async getLeads(organisationId: string, filters?: { stageId?: string; status?: string; agentId?: string }) {
    let query = this.db
      .selectFrom('leads as l')
      .innerJoin('lead_stages as ls', 'ls.id', 'l.current_stage_id')
      .selectAll('l')
      .select(['ls.name as stage_name', 'ls.stage_order'])
      .where('l.organisation_id', '=', organisationId);

    if (filters?.stageId) {
      query = query.where('l.current_stage_id', '=', filters.stageId);
    }
    if (filters?.status) {
      query = query.where('l.status', '=', filters.status as any);
    }
    if (filters?.agentId) {
      query = query.where('l.assigned_agent_user_id', '=', filters.agentId);
    }

    return query.orderBy('l.created_at', 'desc').execute();
  }

  /**
   * Retrieves full lead details including activities, assignments, and interactions.
   */
  async getLeadById(organisationId: string, leadId: string) {
    const lead = await this.db
      .selectFrom('leads as l')
      .innerJoin('lead_stages as ls', 'ls.id', 'l.current_stage_id')
      .selectAll('l')
      .select(['ls.name as stage_name', 'ls.stage_order'])
      .where('l.id', '=', leadId)
      .where('l.organisation_id', '=', organisationId)
      .executeTakeFirst();

    if (!lead) return null;

    const activities = await this.db
      .selectFrom('lead_activities')
      .selectAll()
      .where('lead_id', '=', leadId)
      .orderBy('created_at', 'desc')
      .execute();

    const interactions = await this.db
      .selectFrom('lead_interactions')
      .selectAll()
      .where('lead_id', '=', leadId)
      .orderBy('recorded_at', 'desc')
      .execute();

    return {
      ...lead,
      activities,
      interactions,
    };
  }
}
