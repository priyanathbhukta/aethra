// ==============================================================================
// AETHRA Project Management Service — Application Domain Service & EPC Milestones
// ==============================================================================

import crypto from 'node:crypto';
import { Kysely } from 'kysely';
import { ProjectDatabaseSchema } from '../database/connection.js';
import {
  KafkaTopics,
  createEventEnvelope,
  ProjectCreatedEventPayload,
  ProjectMilestonePublishedEventPayload,
  ProjectHandoverCompletedEventPayload,
} from '@aethra/event-contracts';
import { createStructuredLogger } from '@aethra/observability';
import {
  CreateProjectDto,
  UpdateMilestoneDto,
  CreateProjectTaskDto,
  CompleteHandoverDto,
} from '@aethra/api-contracts';

const logger = createStructuredLogger('project-service');

export interface CreateProjectCommand extends CreateProjectDto {
  organisationId: string;
  projectManagerUserId: string;
  correlationId: string;
}

export interface UpdateMilestoneCommand extends UpdateMilestoneDto {
  organisationId: string;
  projectId: string;
  milestoneId: string;
  correlationId: string;
}

export interface CreateTaskCommand extends CreateProjectTaskDto {
  organisationId: string;
  projectId: string;
}

export interface CompleteHandoverCommand extends CompleteHandoverDto {
  organisationId: string;
  projectId: string;
  signedOffByUserId: string;
  correlationId: string;
}

export class ProjectApplicationService {
  constructor(private readonly db: Kysely<ProjectDatabaseSchema>) {}

  /**
   * Initializes a new EPC Solar Project from accepted quotation or direct contract.
   * Auto-provisions 6 standard EPC milestone phases and customer progress view projection.
   */
  async createProject(cmd: CreateProjectCommand) {
    const projectId = crypto.randomUUID();
    const now = new Date();
    const year = now.getFullYear();
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const projectCode = `PRJ-${year}-${randSuffix}`;

    const plannedStart = new Date(cmd.plannedStartDate);
    const plannedCompletion = new Date(cmd.plannedCompletionDate);

    // Standard 6 EPC Solar Milestones
    const defaultMilestones = [
      { name: 'Site Survey & Engineering Design', order: 1, weight: 15.0 },
      { name: 'Procurement & Material Delivery', order: 2, weight: 25.0 },
      { name: 'Mounting Structure & Module Installation', order: 3, weight: 25.0 },
      { name: 'Inverter, Cabling & Electrical Works', order: 4, weight: 15.0 },
      { name: 'DISCOM Net-Metering & CEIG Inspection', order: 5, weight: 10.0 },
      { name: 'Plant Commissioning & Handover', order: 6, weight: 10.0 },
    ];

    const result = await this.db.transaction().execute(async (trx) => {
      // 1. Create Project Master
      const project = await trx
        .insertInto('projects')
        .values({
          id: projectId,
          organisation_id: cmd.organisationId,
          project_code: projectCode,
          project_name: cmd.projectName.trim(),
          customer_id: cmd.customerId,
          property_id: cmd.propertyId,
          quotation_id: cmd.quotationId || null,
          accepted_quotation_revision_id: cmd.acceptedQuotationRevisionId || null,
          project_type: cmd.projectType || 'residential_rooftop',
          capacity_kw: cmd.capacityKw,
          status: 'initiated',
          planned_start_date: plannedStart,
          planned_completion_date: plannedCompletion,
          actual_start_date: null,
          actual_completion_date: null,
          project_manager_user_id: cmd.projectManagerUserId,
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // 2. Create Project Site
      await trx
        .insertInto('project_sites')
        .values({
          id: crypto.randomUUID(),
          project_id: projectId,
          organisation_id: cmd.organisationId,
          site_contact_name: cmd.siteContactName.trim(),
          site_contact_phone: cmd.siteContactPhone.trim(),
          site_address: cmd.siteAddress.trim(),
          latitude: cmd.latitude || null,
          longitude: cmd.longitude || null,
          discom_subdivision: cmd.discomSubdivision || null,
          sanctioned_load_kw: cmd.sanctionedLoadKw || null,
          discom_application_number: cmd.discomApplicationNumber || null,
          survey_completed_at: null,
        })
        .execute();

      // 3. Create Default Milestones
      const createdMilestones: any[] = [];
      for (const m of defaultMilestones) {
        const ms = await trx
          .insertInto('milestones')
          .values({
            id: crypto.randomUUID(),
            project_id: projectId,
            organisation_id: cmd.organisationId,
            milestone_name: m.name,
            sequence_order: m.order,
            status: 'pending',
            target_date: plannedCompletion,
            completed_date: null,
            is_customer_visible: true,
            weightage_percent: m.weight,
            created_at: now,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        createdMilestones.push(ms);
      }

      // 4. Initialize Customer Progress View Projection
      const customerMilestones = createdMilestones.map((m) => ({
        milestoneName: m.milestone_name,
        sequence: m.sequence_order,
        status: m.status,
      }));

      await trx
        .insertInto('customer_progress_views')
        .values({
          id: crypto.randomUUID(),
          project_id: projectId,
          customer_id: cmd.customerId,
          property_id: cmd.propertyId,
          overall_progress_percentage: 0.0,
          current_phase_display: 'Site Survey & Engineering Design',
          published_milestones: customerMilestones as any,
          last_published_at: now,
          updated_at: now,
        })
        .execute();

      // 5. Outbox Event
      const outboxPayload: ProjectCreatedEventPayload = {
        projectId,
        projectCode,
        organisationId: cmd.organisationId,
        customerId: cmd.customerId,
        propertyId: cmd.propertyId,
        quotationId: cmd.quotationId,
        acceptedRevisionId: cmd.acceptedQuotationRevisionId,
        capacityKw: cmd.capacityKw,
        projectManagerUserId: cmd.projectManagerUserId,
        createdAt: now.toISOString(),
      };

      const envelope = createEventEnvelope(
        KafkaTopics.PROJECT_CREATED,
        'aethra-project-service',
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
          topic: KafkaTopics.PROJECT_CREATED,
          partition_key: cmd.organisationId,
          payload: envelope as unknown as Record<string, unknown>,
          correlation_id: cmd.correlationId,
          status: 'pending',
          retry_count: 0,
          created_at: now,
        })
        .execute();

      return { project, milestones: createdMilestones };
    });

    logger.info({ projectId: result.project.id, code: result.project.project_code }, 'EPC Solar Project created');
    return result;
  }

  /**
   * Updates milestone status, recalculates overall progress, updates customer view projection,
   * and publishes project.milestone.published.v1 event.
   */
  async updateMilestone(cmd: UpdateMilestoneCommand) {
    const now = new Date();

    const result = await this.db.transaction().execute(async (trx) => {
      // 1. Update the milestone
      const updatedMilestone = await trx
        .updateTable('milestones')
        .set({
          status: cmd.status,
          completed_date: cmd.status === 'completed' ? new Date(cmd.completedDate || now) : null,
        })
        .where('id', '=', cmd.milestoneId)
        .where('project_id', '=', cmd.projectId)
        .where('organisation_id', '=', cmd.organisationId)
        .returningAll()
        .executeTakeFirstOrThrow();

      // 2. Fetch all milestones to compute cumulative progress
      const allMilestones = await trx
        .selectFrom('milestones')
        .selectAll()
        .where('project_id', '=', cmd.projectId)
        .orderBy('sequence_order', 'asc')
        .execute();

      let progress = 0;
      let activePhaseName = 'Initiation';

      for (const m of allMilestones) {
        if (m.status === 'completed') {
          progress += Number(m.weightage_percent);
        } else if (m.status === 'in_progress' || (m.status === 'pending' && activePhaseName === 'Initiation')) {
          activePhaseName = m.milestone_name;
        }
      }

      progress = Math.min(100.0, Number(progress.toFixed(2)));

      // 3. Update Customer Progress View projection
      const sanitizedMilestones = allMilestones.map((m) => ({
        milestoneName: m.milestone_name,
        sequence: m.sequence_order,
        status: m.status,
        completedDate: m.completed_date,
      }));

      await trx
        .updateTable('customer_progress_views')
        .set({
          overall_progress_percentage: progress,
          current_phase_display: activePhaseName,
          published_milestones: sanitizedMilestones as any,
          last_published_at: now,
          updated_at: now,
        })
        .where('project_id', '=', cmd.projectId)
        .execute();

      // 4. Outbox Event
      const outboxPayload: ProjectMilestonePublishedEventPayload = {
        milestoneId: updatedMilestone.id,
        projectId: cmd.projectId,
        organisationId: cmd.organisationId,
        milestoneName: updatedMilestone.milestone_name,
        status: updatedMilestone.status,
        overallProgressPercentage: progress,
        publishedAt: now.toISOString(),
      };

      const envelope = createEventEnvelope(
        KafkaTopics.PROJECT_MILESTONE_PUBLISHED,
        'aethra-project-service',
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
          topic: KafkaTopics.PROJECT_MILESTONE_PUBLISHED,
          partition_key: cmd.organisationId,
          payload: envelope as unknown as Record<string, unknown>,
          correlation_id: cmd.correlationId,
          status: 'pending',
          retry_count: 0,
          created_at: now,
        })
        .execute();

      return { milestone: updatedMilestone, overallProgressPercentage: progress };
    });

    logger.info(
      { projectId: cmd.projectId, milestone: cmd.milestoneId, progress: result.overallProgressPercentage },
      'Project milestone updated and customer view refreshed'
    );

    return result;
  }

  /**
   * Completes commissioning and handover of solar plant.
   * Emits project.handover.completed.v1 which prompts Customer Service to mark installation operational!
   */
  async completeHandover(cmd: CompleteHandoverCommand) {
    const project = await this.db
      .selectFrom('projects')
      .selectAll()
      .where('id', '=', cmd.projectId)
      .where('organisation_id', '=', cmd.organisationId)
      .executeTakeFirst();

    if (!project) {
      throw new Error(`Project '${cmd.projectId}' not found`);
    }

    const now = new Date();
    const handoverDate = new Date(cmd.handoverDate);
    const handoverId = crypto.randomUUID();

    const result = await this.db.transaction().execute(async (trx) => {
      // 1. Create Handover record
      const handover = await trx
        .insertInto('handover_records')
        .values({
          id: handoverId,
          project_id: cmd.projectId,
          organisation_id: cmd.organisationId,
          handover_date: handoverDate,
          discom_inspection_letter_doc_id: cmd.discomInspectionLetterDocId || null,
          commissioning_report_doc_id: cmd.commissioningReportDocId,
          warranty_pack_doc_id: cmd.warrantyPackDocId,
          signed_off_by_vendor_user_id: cmd.signedOffByUserId,
          accepted_by_customer_user_id: null,
          customer_accepted_at: null,
          customer_satisfaction_rating: null,
          handover_status: 'pending_customer_signature',
          created_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // 2. Update Project status
      await trx
        .updateTable('projects')
        .set({
          status: 'handover_complete',
          actual_completion_date: handoverDate,
          updated_at: now,
        })
        .where('id', '=', cmd.projectId)
        .execute();

      // 3. Set Customer Progress View to 100%
      await trx
        .updateTable('customer_progress_views')
        .set({
          overall_progress_percentage: 100.0,
          current_phase_display: 'Handover Complete & Operational',
          last_published_at: now,
          updated_at: now,
        })
        .where('project_id', '=', cmd.projectId)
        .execute();

      // 4. Outbox Event (triggers Customer Service asset activation)
      const outboxPayload: ProjectHandoverCompletedEventPayload = {
        handoverId,
        projectId: cmd.projectId,
        organisationId: cmd.organisationId,
        customerId: project.customer_id,
        propertyId: project.property_id,
        capacityKw: Number(project.capacity_kw),
        handoverDate: handoverDate.toISOString(),
        commissioningReportDocId: cmd.commissioningReportDocId,
        completedAt: now.toISOString(),
      };

      const envelope = createEventEnvelope(
        KafkaTopics.PROJECT_HANDOVER_COMPLETED,
        'aethra-project-service',
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
          topic: KafkaTopics.PROJECT_HANDOVER_COMPLETED,
          partition_key: cmd.organisationId,
          payload: envelope as unknown as Record<string, unknown>,
          correlation_id: cmd.correlationId,
          status: 'pending',
          retry_count: 0,
          created_at: now,
        })
        .execute();

      return handover;
    });

    logger.info({ projectId: cmd.projectId, handoverId }, 'Solar plant handover completed');
    return result;
  }

  /**
   * Retrieves sanitized customer progress view.
   * Guarantees internal tasks, margins, and private notes are NEVER exposed.
   */
  async getCustomerProgressView(customerId: string, projectId: string) {
    return await this.db
      .selectFrom('customer_progress_views')
      .selectAll()
      .where('customer_id', '=', customerId)
      .where('project_id', '=', projectId)
      .executeTakeFirst();
  }

  /**
   * Retrieves project details with milestones and site info for vendor operations.
   */
  async getProjectById(organisationId: string, projectId: string) {
    const project = await this.db
      .selectFrom('projects')
      .selectAll()
      .where('id', '=', projectId)
      .where('organisation_id', '=', organisationId)
      .executeTakeFirst();

    if (!project) return null;

    const site = await this.db
      .selectFrom('project_sites')
      .selectAll()
      .where('project_id', '=', projectId)
      .executeTakeFirst();

    const milestones = await this.db
      .selectFrom('milestones')
      .selectAll()
      .where('project_id', '=', projectId)
      .orderBy('sequence_order', 'asc')
      .execute();

    return { ...project, site, milestones };
  }
}
