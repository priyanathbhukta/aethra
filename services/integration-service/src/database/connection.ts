// ==============================================================================
// AETHRA Integration Service — Database Connection & Typed Kysely Schema
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { loadAppConfig } from '@aethra/config';
import { createStructuredLogger } from '@aethra/observability';

const { Pool } = pg;
const logger = createStructuredLogger('integration-service-db');
const config = loadAppConfig('integration-service', 3018);

export interface IntegrationProvidersTable {
  id: string;
  provider_code: string;
  name: string;
  provider_type: string;
  is_active: boolean;
}

export interface IntegrationConnectionsTable {
  id: string;
  organisation_id: string;
  provider_id: string;
  connection_name: string;
  encrypted_credentials_ref: string;
  status: string;
  last_healthy_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface WebhookEndpointsTable {
  id: string;
  connection_id: string;
  endpoint_path: string;
  signing_secret_ref: string;
  is_active: boolean;
  created_at: Date;
}

export interface WebhookDeliveriesTable {
  id: string;
  endpoint_id: string;
  event_id_header: string | null;
  payload_hash: string;
  payload: Record<string, unknown> | any;
  processing_status: string;
  error_message: string | null;
  received_at: Date;
}

export interface SyncStatusTable {
  id: string;
  connection_id: string;
  sync_domain: string;
  last_synced_at: Date;
  last_cursor: string | null;
  records_processed: number;
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

export interface IntegrationDatabaseSchema {
  integration_providers: IntegrationProvidersTable;
  integration_connections: IntegrationConnectionsTable;
  webhook_endpoints: WebhookEndpointsTable;
  webhook_deliveries: WebhookDeliveriesTable;
  sync_status: SyncStatusTable;
  outbox_events: OutboxEventsTable;
}

export function createDatabaseClient(): Kysely<IntegrationDatabaseSchema> {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      `postgresql://${config.database.user}:${config.database.password}@${config.database.host}:${config.database.port}/integration_db`,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  return new Kysely<IntegrationDatabaseSchema>({
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
    logger.info({ migration: file }, 'Executing integration_db migration');
    await sql.raw(sqlContent).execute(db);
  }
}
