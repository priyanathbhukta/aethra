// ==============================================================================
// AETHRA Service Management — Application Domain Service
// ==============================================================================

import crypto from 'node:crypto';
import { Kysely } from 'kysely';
import { ServiceManagementDatabaseSchema } from '../database/connection.js';
import {
  KafkaTopics,
  createEventEnvelope,
  ServiceTicketCreatedEventPayload,
} from '@aethra/event-contracts';
import { createStructuredLogger } from '@aethra/observability';
import {
  CreateAmcContractDto,
  CreateServiceTicketDto,
  AssignTechnicianDto,
  RecordServiceVisitDto,
} from '@aethra/api-contracts';

const logger = createStructuredLogger('service-management-service');

export interface CreateAmcCommand extends CreateAmcContractDto {
  organisationId: string;
}

export interface CreateTicketCommand extends CreateServiceTicketDto {
  organisationId: string;
  createdByUserId: string;
  correlationId: string;
}

export interface AssignTechnicianCommand extends AssignTechnicianDto {
  organisationId: string;
  ticketId: string;
  assignedByUserId: string;
}

export interface RecordServiceVisitCommand extends RecordServiceVisitDto {
  organisationId: string;
  ticketId: string;
}

export class ServiceManagementApplicationService {
  constructor(private readonly db: Kysely<ServiceManagementDatabaseSchema>) {}

  /**
   * Registers an Annual Maintenance Contract (AMC).
   */
  async createAmcContract(cmd: CreateAmcCommand) {
    const amcId = crypto.randomUUID();
    const now = new Date();
    const year = now.getFullYear();
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const amcCode = `AMC-${year}-${randSuffix}`;

    const amc = await this.db
      .insertInto('amc_contracts')
      .values({
        id: amcId,
        organisation_id: cmd.organisationId,
        amc_code: amcCode,
        customer_id: cmd.customerId,
        property_id: cmd.propertyId,
        installation_id: cmd.installationId,
        contract_tier: cmd.contractTier || 'preventive_only',
        visits_per_year: cmd.visitsPerYear || 4,
        contract_amount: cmd.contractAmount,
        start_date: new Date(cmd.startDate),
        end_date: new Date(cmd.endDate),
        status: 'active',
        created_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    logger.info({ amcId: amc.id, code: amc.amc_code }, 'AMC Contract provisioned');
    return amc;
  }

  /**
   * Creates a service or maintenance ticket and dispatches outbox event.
   */
  async createServiceTicket(cmd: CreateTicketCommand) {
    const ticketId = crypto.randomUUID();
    const now = new Date();
    const year = now.getFullYear();
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const ticketNumber = `TKT-${year}-${randSuffix}`;

    const result = await this.db.transaction().execute(async (trx) => {
      // 1. Create Service Ticket
      const ticket = await trx
        .insertInto('service_tickets')
        .values({
          id: ticketId,
          organisation_id: cmd.organisationId,
          ticket_number: ticketNumber,
          customer_id: cmd.customerId,
          property_id: cmd.propertyId,
          installation_id: cmd.installationId || null,
          amc_id: cmd.amcId || null,
          ticket_type: cmd.ticketType,
          priority: cmd.priority || 'medium',
          status: 'open',
          customer_reported_issue: cmd.customerReportedIssue.trim(),
          created_by_user_id: cmd.createdByUserId,
          resolved_at: null,
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // 2. Insert initial ticket event
      await trx
        .insertInto('ticket_events')
        .values({
          id: crypto.randomUUID(),
          ticket_id: ticketId,
          organisation_id: cmd.organisationId,
          event_type: 'ticket_created',
          summary: `Ticket logged: ${cmd.ticketType} (${cmd.priority || 'medium'})`,
          is_customer_visible: true,
          actor_user_id: cmd.createdByUserId,
          created_at: now,
        })
        .execute();

      // 3. Outbox Event
      const outboxPayload: ServiceTicketCreatedEventPayload = {
        ticketId,
        ticketNumber,
        organisationId: cmd.organisationId,
        customerId: cmd.customerId,
        propertyId: cmd.propertyId,
        installationId: cmd.installationId,
        ticketType: cmd.ticketType,
        priority: cmd.priority || 'medium',
        createdAt: now.toISOString(),
      };

      const envelope = createEventEnvelope(
        KafkaTopics.SERVICE_TICKET_CREATED,
        'aethra-service-management-service',
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
          topic: KafkaTopics.SERVICE_TICKET_CREATED,
          partition_key: cmd.organisationId,
          payload: envelope as unknown as Record<string, unknown>,
          correlation_id: cmd.correlationId,
          status: 'pending',
          retry_count: 0,
          created_at: now,
        })
        .execute();

      return ticket;
    });

    logger.info({ ticketId: result.id, number: result.ticket_number }, 'Service ticket created');
    return result;
  }

  /**
   * Dispatches a field technician to inspect or repair the installation.
   */
  async assignTechnician(cmd: AssignTechnicianCommand) {
    const now = new Date();
    const assignmentId = crypto.randomUUID();

    const assignment = await this.db.transaction().execute(async (trx) => {
      // 1. Create Assignment
      const assign = await trx
        .insertInto('service_assignments')
        .values({
          id: assignmentId,
          ticket_id: cmd.ticketId,
          technician_user_id: cmd.technicianUserId,
          scheduled_at: new Date(cmd.scheduledAt),
          status: 'scheduled',
          assigned_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // 2. Update Ticket Status
      await trx
        .updateTable('service_tickets')
        .set({
          status: 'assigned',
          updated_at: now,
        })
        .where('id', '=', cmd.ticketId)
        .where('organisation_id', '=', cmd.organisationId)
        .execute();

      // 3. Log event
      await trx
        .insertInto('ticket_events')
        .values({
          id: crypto.randomUUID(),
          ticket_id: cmd.ticketId,
          organisation_id: cmd.organisationId,
          event_type: 'technician_assigned',
          summary: `Technician assigned for scheduled visit on ${new Date(cmd.scheduledAt).toLocaleDateString()}`,
          is_customer_visible: true,
          actor_user_id: cmd.assignedByUserId,
          created_at: now,
        })
        .execute();

      return assign;
    });

    logger.info({ ticketId: cmd.ticketId, assignmentId }, 'Technician assigned to service ticket');
    return assignment;
  }

  /**
   * Records on-site technician visit, consumed parts/serials, and marks ticket resolved.
   */
  async recordServiceVisit(cmd: RecordServiceVisitCommand) {
    const visitId = crypto.randomUUID();
    const now = new Date();

    const visit = await this.db.transaction().execute(async (trx) => {
      // 1. Insert Visit record
      const vis = await trx
        .insertInto('service_visits')
        .values({
          id: visitId,
          assignment_id: cmd.assignmentId,
          ticket_id: cmd.ticketId,
          arrival_time: new Date(cmd.arrivalTime),
          departure_time: cmd.departureTime ? new Date(cmd.departureTime) : now,
          site_observations: cmd.siteObservations.trim(),
          root_cause: cmd.rootCause ? cmd.rootCause.trim() : null,
          corrective_action: cmd.correctiveAction.trim(),
          customer_signoff_name: cmd.customerSignoffName ? cmd.customerSignoffName.trim() : null,
          customer_signature_doc_id: cmd.customerSignatureDocId || null,
          signed_at: cmd.customerSignoffName ? now : null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // 2. Record consumed replacement parts
      if (cmd.partsUsed && cmd.partsUsed.length > 0) {
        for (const p of cmd.partsUsed) {
          await trx
            .insertInto('parts_used')
            .values({
              id: crypto.randomUUID(),
              visit_id: visitId,
              organisation_id: cmd.organisationId,
              catalogue_product_id: p.catalogueProductId,
              item_name: p.itemName.trim(),
              quantity: p.quantity || 1,
              serial_number_removed: p.serialNumberRemoved || null,
              serial_number_installed: p.serialNumberInstalled || null,
              warranty_status: p.warrantyStatus || 'covered_under_warranty',
              billed_amount: p.billedAmount || 0,
            })
            .execute();
        }
      }

      // 3. Mark ticket resolved
      await trx
        .updateTable('service_tickets')
        .set({
          status: 'resolved',
          resolved_at: now,
          updated_at: now,
        })
        .where('id', '=', cmd.ticketId)
        .where('organisation_id', '=', cmd.organisationId)
        .execute();

      // 4. Log ticket resolution event
      await trx
        .insertInto('ticket_events')
        .values({
          id: crypto.randomUUID(),
          ticket_id: cmd.ticketId,
          organisation_id: cmd.organisationId,
          event_type: 'ticket_resolved',
          summary: `Site visit completed. Corrective action: ${cmd.correctiveAction.trim()}`,
          is_customer_visible: true,
          actor_user_id: 'technician',
          created_at: now,
        })
        .execute();

      return vis;
    });

    logger.info({ ticketId: cmd.ticketId, visitId }, 'Service visit recorded and ticket resolved');
    return visit;
  }

  /**
   * Retrieves ticket details, assignments, visits, and timeline events.
   */
  async getTicketById(organisationId: string, ticketId: string) {
    const ticket = await this.db
      .selectFrom('service_tickets')
      .selectAll()
      .where('id', '=', ticketId)
      .where('organisation_id', '=', organisationId)
      .executeTakeFirst();

    if (!ticket) return null;

    const events = await this.db
      .selectFrom('ticket_events')
      .selectAll()
      .where('ticket_id', '=', ticketId)
      .orderBy('created_at', 'asc')
      .execute();

    const assignments = await this.db
      .selectFrom('service_assignments')
      .selectAll()
      .where('ticket_id', '=', ticketId)
      .orderBy('assigned_at', 'desc')
      .execute();

    return { ...ticket, events, assignments };
  }
}
