// ==============================================================================
// AETHRA Document Service — Database Connection & Typed Kysely Schema
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { loadAppConfig } from '@aethra/config';
import { createStructuredLogger } from '@aethra/observability';

const { Pool } = pg;
const logger = createStructuredLogger('document-service-db');
const config = loadAppConfig('document-service', 3014);

export interface FileClassificationsTable {
  id: string;
  code: string;
  name: string;
  sensitivity_level: string;
  requires_malware_scan: boolean;
}

export interface FilesTable {
  id: string;
  organisation_id: string | null;
  classification_id: string;
  file_name: string;
  s3_bucket: string;
  s3_key: string;
  content_type: string;
  file_size_bytes: number | string;
  sha256_hash: string;
  uploaded_by_user_id: string;
  created_at: Date;
}

export interface UploadSessionsTable {
  id: string;
  organisation_id: string | null;
  session_token: string;
  target_s3_key: string;
  expected_content_type: string;
  max_bytes: number | string;
  expires_at: Date;
  status: string;
  created_at: Date;
}

export interface FileAccessPoliciesTable {
  id: string;
  file_id: string;
  entity_type: string;
  entity_id: string;
  permission_required: string;
  allow_customer_access: boolean;
  created_at: Date;
}

export interface FileProcessingStateTable {
  id: string;
  file_id: string;
  scan_status: string;
  scan_engine: string | null;
  scanned_at: Date | null;
  thumbnail_s3_key: string | null;
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

export interface DocumentDatabaseSchema {
  file_classifications: FileClassificationsTable;
  files: FilesTable;
  upload_sessions: UploadSessionsTable;
  file_access_policies: FileAccessPoliciesTable;
  file_processing_state: FileProcessingStateTable;
  outbox_events: OutboxEventsTable;
}

export function createDatabaseClient(): Kysely<DocumentDatabaseSchema> {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      `postgresql://${config.database.user}:${config.database.password}@${config.database.host}:${config.database.port}/document_db`,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  return new Kysely<DocumentDatabaseSchema>({
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
    logger.info({ migration: file }, 'Executing document_db migration');
    await sql.raw(sqlContent).execute(db);
  }
}
