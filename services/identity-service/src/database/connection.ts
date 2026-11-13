// ==============================================================================
// AETHRA Identity Service — Database Connection & Migration Runner
// ==============================================================================

import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAppConfig } from '@aethra/config';

const { Pool } = pg;
const config = loadAppConfig('identity-service', 3001);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface UsersTable {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  email_status: 'unverified' | 'verified';
  phone_status: 'unverified' | 'verified';
  avatar_url: string | null;
  status: 'active' | 'suspended' | 'deactivated';
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
}

export interface UserAuthProvidersTable {
  id: string;
  user_id: string;
  provider_type: 'cognito' | 'google' | 'microsoft' | 'email_password' | 'phone_otp';
  provider_subject: string;
  provider_issuer: string;
  provider_metadata: Record<string, unknown> | null;
  linked_at: Date;
  last_used_at: Date | null;
}

export interface UserSessionsTable {
  id: string;
  user_id: string;
  session_token_hash: string;
  ip_address: string | null;
  user_agent: string | null;
  device_fingerprint: string | null;
  is_revoked: boolean;
  created_at: Date;
  expires_at: Date;
  last_active_at: Date;
}

export interface OutboxEventsTable {
  id: string;
  event_type: string;
  topic: string;
  partition_key: string;
  payload: Record<string, unknown>;
  correlation_id: string;
  status: 'pending' | 'processing' | 'published' | 'failed';
  retry_count: number;
  last_error: string | null;
  created_at: Date;
  processed_at: Date | null;
}

export interface IdentityDatabaseSchema {
  users: UsersTable;
  user_auth_providers: UserAuthProvidersTable;
  user_sessions: UserSessionsTable;
  outbox_events: OutboxEventsTable;
}

export function createDatabaseClient(databaseName: string = 'identity_db'): Kysely<IdentityDatabaseSchema> {
  const pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: databaseName,
    user: config.database.user,
    password: config.database.password,
    min: config.database.poolMin,
    max: config.database.poolMax,
    ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
  });

  return new Kysely<IdentityDatabaseSchema>({
    dialect: new PostgresDialect({ pool }),
  });
}

/**
 * Migration runner: reads and executes all SQL migration files in order
 */
export async function runMigrations(db: Kysely<IdentityDatabaseSchema>): Promise<void> {
  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    return;
  }
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    await sql.raw(sqlContent).execute(db);
  }
}
