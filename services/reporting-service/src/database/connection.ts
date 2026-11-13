// ==============================================================================
// AETHRA Reporting Service — Database Connection & Typed Kysely Schema
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { loadAppConfig } from '@aethra/config';
import { createStructuredLogger } from '@aethra/observability';

const { Pool } = pg;
const logger = createStructuredLogger('reporting-service-db');
const config = loadAppConfig('reporting-service', 3017);

export interface ReportDefinitionsTable {
  id: string;
  report_code: string;
  name: string;
  category: string;
  parameters_schema: Record<string, unknown> | any;
  is_active: boolean;
  created_at: Date;
}

export interface ReportProjectionsTable {
  id: string;
  organisation_id: string;
  projection_type: string;
  period_start: Date;
  period_end: Date;
  aggregated_metrics: Record<string, unknown> | any;
  last_updated_at: Date;
}

export interface ExportJobsTable {
  id: string;
  organisation_id: string;
  report_id: string;
  requested_by_user_id: string;
  filter_parameters: Record<string, unknown> | any;
  export_format: string;
  status: string;
  download_file_id: string | null;
  expires_at: Date | null;
  created_at: Date;
  completed_at: Date | null;
}

export interface AnalyticsAggregationsTable {
  id: string;
  organisation_id: string;
  metric_name: string;
  metric_value: number | string;
  snapshot_date: Date;
  computed_at: Date;
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

export interface ReportingDatabaseSchema {
  report_definitions: ReportDefinitionsTable;
  report_projections: ReportProjectionsTable;
  export_jobs: ExportJobsTable;
  analytics_aggregations: AnalyticsAggregationsTable;
  outbox_events: OutboxEventsTable;
}

export function createDatabaseClient(): Kysely<ReportingDatabaseSchema> {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      `postgresql://${config.database.user}:${config.database.password}@${config.database.host}:${config.database.port}/reporting_db`,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  return new Kysely<ReportingDatabaseSchema>({
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
    logger.info({ migration: file }, 'Executing reporting_db migration');
    await sql.raw(sqlContent).execute(db);
  }
}
