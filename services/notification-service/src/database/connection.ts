// ==============================================================================
// AETHRA Notification Service — Database Connection & Typed Kysely Schema
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { loadAppConfig } from '@aethra/config';
import { createStructuredLogger } from '@aethra/observability';

const { Pool } = pg;
const logger = createStructuredLogger('notification-service-db');
const config = loadAppConfig('notification-service', 3015);

export interface NotificationPreferencesTable {
  id: string;
  user_id: string;
  channel: string;
  category: string;
  is_enabled: boolean;
  updated_at: Date;
}

export interface NotificationTemplatesTable {
  id: string;
  template_code: string;
  channel: string;
  subject_template: string | null;
  body_template: string;
  required_variables: Record<string, unknown> | any;
  is_active: boolean;
  updated_at: Date;
}

export interface NotificationDeliveriesTable {
  id: string;
  organisation_id: string | null;
  template_id: string;
  recipient_user_id: string | null;
  destination: string;
  channel: string;
  template_data: Record<string, unknown>;
  status: string;
  retry_count: number;
  created_at: Date;
  sent_at: Date | null;
}

export interface DeliveryAttemptsTable {
  id: string;
  delivery_id: string;
  provider_name: string;
  provider_message_id: string | null;
  status: string;
  error_response: string | null;
  attempted_at: Date;
}

export interface InAppNotificationsTable {
  id: string;
  recipient_user_id: string;
  organisation_id: string | null;
  title: string;
  body: string;
  link_action: string | null;
  is_read: boolean;
  read_at: Date | null;
  created_at: Date;
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

export interface NotificationDatabaseSchema {
  notification_preferences: NotificationPreferencesTable;
  notification_templates: NotificationTemplatesTable;
  notification_deliveries: NotificationDeliveriesTable;
  delivery_attempts: DeliveryAttemptsTable;
  in_app_notifications: InAppNotificationsTable;
  outbox_events: OutboxEventsTable;
}

export function createDatabaseClient(): Kysely<NotificationDatabaseSchema> {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      `postgresql://${config.database.user}:${config.database.password}@${config.database.host}:${config.database.port}/notification_db`,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  return new Kysely<NotificationDatabaseSchema>({
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
    logger.info({ migration: file }, 'Executing notification_db migration');
    await sql.raw(sqlContent).execute(db);
  }
}
