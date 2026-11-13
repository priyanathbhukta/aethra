// ==============================================================================
// AETHRA Project Service — Database Connection & Typed Kysely Schema
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { loadAppConfig } from '@aethra/config';
import { createStructuredLogger } from '@aethra/observability';

const { Pool } = pg;
const logger = createStructuredLogger('project-service-db');
const config = loadAppConfig('project-service', 3013);

export interface ProjectsTable {
  id: string;
  organisation_id: string;
  project_code: string;
  project_name: string;
  customer_id: string;
  property_id: string;
  quotation_id: string | null;
  accepted_quotation_revision_id: string | null;
  project_type: string;
  capacity_kw: number | string;
  status: string;
  planned_start_date: Date;
  planned_completion_date: Date;
  actual_start_date: Date | null;
  actual_completion_date: Date | null;
  project_manager_user_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface ProjectSitesTable {
  id: string;
  project_id: string;
  organisation_id: string;
  site_contact_name: string;
  site_contact_phone: string;
  site_address: string;
  latitude: number | string | null;
  longitude: number | string | null;
  discom_subdivision: string | null;
  sanctioned_load_kw: string | null;
  discom_application_number: string | null;
  survey_completed_at: Date | null;
}

export interface MilestonesTable {
  id: string;
  project_id: string;
  organisation_id: string;
  milestone_name: string;
  sequence_order: number;
  status: string;
  target_date: Date;
  completed_date: Date | null;
  is_customer_visible: boolean;
  weightage_percent: number | string;
  created_at: Date;
}

export interface TasksTable {
  id: string;
  milestone_id: string;
  project_id: string;
  organisation_id: string;
  task_name: string;
  description: string | null;
  status: string;
  priority: string;
  start_date: Date | null;
  due_date: Date;
  finished_at: Date | null;
  estimated_hours: number | string | null;
  actual_hours: number | string | null;
  created_at: Date;
}

export interface TaskAssignmentsTable {
  id: string;
  task_id: string;
  organisation_id: string;
  assigned_user_id: string;
  role_on_task: string;
  assigned_at: Date;
}

export interface HandoverRecordsTable {
  id: string;
  project_id: string;
  organisation_id: string;
  handover_date: Date;
  discom_inspection_letter_doc_id: string | null;
  commissioning_report_doc_id: string;
  warranty_pack_doc_id: string;
  signed_off_by_vendor_user_id: string;
  accepted_by_customer_user_id: string | null;
  customer_accepted_at: Date | null;
  customer_satisfaction_rating: string | null;
  handover_status: string;
  created_at: Date;
}

export interface CustomerProgressViewsTable {
  id: string;
  project_id: string;
  customer_id: string;
  property_id: string;
  overall_progress_percentage: number | string;
  current_phase_display: string;
  published_milestones: Record<string, unknown> | any;
  last_published_at: Date;
  updated_at: Date;
}

export interface OutboxEventsTable {
  id: string;
  event_type: string;
  topic: string;
  partition_key: string;
  payload: Record<string, unknown>;
  correlation_id: string;
  status: string;
  retry_count: number;
  created_at: Date;
  processed_at?: Date | null;
}

export interface ProjectDatabaseSchema {
  projects: ProjectsTable;
  project_sites: ProjectSitesTable;
  milestones: MilestonesTable;
  tasks: TasksTable;
  task_assignments: TaskAssignmentsTable;
  handover_records: HandoverRecordsTable;
  customer_progress_views: CustomerProgressViewsTable;
  outbox_events: OutboxEventsTable;
}

export function createDatabaseClient(): Kysely<ProjectDatabaseSchema> {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      `postgresql://${config.database.user}:${config.database.password}@${config.database.host}:${config.database.port}/project_db`,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  return new Kysely<ProjectDatabaseSchema>({
    dialect: new PostgresDialect({ pool }),
  });
}

export async function runMigrations(db: Kysely<any>): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const migrationsDir = path.join(__dirname, 'migrations');

  if (!fs.existsSync(migrationsDir)) return;

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sqlContent = fs.readFileSync(filePath, 'utf-8');
    logger.info({ migration: file }, 'Executing project_db migration');
    await sql.raw(sqlContent).execute(db);
  }
}
