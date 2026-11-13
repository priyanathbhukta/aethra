// ==============================================================================
// AETHRA Service Management — Database Connection & Typed Kysely Schema
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { loadAppConfig } from '@aethra/config';
import { createStructuredLogger } from '@aethra/observability';

const { Pool } = pg;
const logger = createStructuredLogger('service-management-db');
const config = loadAppConfig('service-management-service', 3016);

export interface AmcContractsTable {
  id: string;
  organisation_id: string;
  amc_code: string;
  customer_id: string;
  property_id: string;
  installation_id: string;
  contract_tier: string;
  visits_per_year: number;
  contract_amount: number | string;
  start_date: Date;
  end_date: Date;
  status: string;
  created_at: Date;
}

export interface ServiceTicketsTable {
  id: string;
  organisation_id: string;
  ticket_number: string;
  customer_id: string;
  property_id: string;
  installation_id: string | null;
  amc_id: string | null;
  ticket_type: string;
  priority: string;
  status: string;
  customer_reported_issue: string;
  created_by_user_id: string;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface TicketEventsTable {
  id: string;
  ticket_id: string;
  organisation_id: string;
  event_type: string;
  summary: string;
  is_customer_visible: boolean;
  actor_user_id: string;
  created_at: Date;
}

export interface ServiceAssignmentsTable {
  id: string;
  ticket_id: string;
  technician_user_id: string;
  scheduled_at: Date;
  status: string;
  assigned_at: Date;
}

export interface ServiceVisitsTable {
  id: string;
  assignment_id: string;
  ticket_id: string;
  arrival_time: Date;
  departure_time: Date | null;
  site_observations: string;
  root_cause: string | null;
  corrective_action: string;
  customer_signoff_name: string | null;
  customer_signature_doc_id: string | null;
  signed_at: Date | null;
}

export interface PartsUsedTable {
  id: string;
  visit_id: string;
  organisation_id: string;
  catalogue_product_id: string;
  item_name: string;
  quantity: number | string;
  serial_number_removed: string | null;
  serial_number_installed: string | null;
  warranty_status: string;
  billed_amount: number | string;
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

export interface ServiceManagementDatabaseSchema {
  amc_contracts: AmcContractsTable;
  service_tickets: ServiceTicketsTable;
  ticket_events: TicketEventsTable;
  service_assignments: ServiceAssignmentsTable;
  service_visits: ServiceVisitsTable;
  parts_used: PartsUsedTable;
  outbox_events: OutboxEventsTable;
}

export function createDatabaseClient(): Kysely<ServiceManagementDatabaseSchema> {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      `postgresql://${config.database.user}:${config.database.password}@${config.database.host}:${config.database.port}/service_db`,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  return new Kysely<ServiceManagementDatabaseSchema>({
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
    logger.info({ migration: file }, 'Executing service_db migration');
    await sql.raw(sqlContent).execute(db);
  }
}
