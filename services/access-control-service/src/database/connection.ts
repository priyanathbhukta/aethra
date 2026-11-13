// ==============================================================================
// AETHRA Access Control Service — Database Connection Manager
// ==============================================================================

import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAppConfig } from '@aethra/config';

const { Pool } = pg;
const config = loadAppConfig('access-control-service', 3003);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface RolesTable {
  id: string;
  organisation_id: string | null;
  code: string;
  name: string;
  description: string | null;
  is_system_role: boolean;
  created_at: Date;
}

export interface PermissionsTable {
  id: string;
  code: string;
  domain: string;
  resource: string;
  action: string;
  description: string | null;
  created_at: Date;
}

export interface RolePermissionsTable {
  id: string;
  role_id: string;
  permission_id: string;
}

export interface MembershipRolesTable {
  id: string;
  organisation_id: string;
  membership_id: string;
  role_id: string;
  assigned_by_user_id: string;
  assigned_at: Date;
}

export interface AccessScopesTable {
  id: string;
  organisation_id: string;
  membership_id: string;
  scope_type: 'organisation' | 'branch' | 'warehouse' | 'project' | 'assignment';
  scope_value: string;
  created_at: Date;
}

export interface TemporaryAccessGrantsTable {
  id: string;
  organisation_id: string;
  user_id: string;
  permission_code: string;
  reason: string;
  granted_by_user_id: string;
  valid_from: Date;
  valid_until: Date;
  revoked_at: Date | null;
  created_at: Date;
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

export interface AccessControlDatabaseSchema {
  roles: RolesTable;
  permissions: PermissionsTable;
  role_permissions: RolePermissionsTable;
  membership_roles: MembershipRolesTable;
  access_scopes: AccessScopesTable;
  temporary_access_grants: TemporaryAccessGrantsTable;
  outbox_events: OutboxEventsTable;
}

export function createDatabaseClient(): Kysely<AccessControlDatabaseSchema> {
  const pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: 'access_control_db',
    user: config.database.user,
    password: config.database.password,
    min: config.database.poolMin,
    max: config.database.poolMax,
  });

  return new Kysely<AccessControlDatabaseSchema>({
    dialect: new PostgresDialect({ pool }),
  });
}

export async function runMigrations(db: Kysely<AccessControlDatabaseSchema>): Promise<void> {
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
