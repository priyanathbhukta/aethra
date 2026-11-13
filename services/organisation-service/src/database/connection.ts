// ==============================================================================
// AETHRA Organisation Service — Database Connection & Tenant Isolation
// ==============================================================================

import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAppConfig } from '@aethra/config';

const { Pool } = pg;
const config = loadAppConfig('organisation-service', 3002);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface OrganisationsTable {
  id: string;
  legal_name: string;
  trade_name: string | null;
  status: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';
  pan_tax_id: string | null;
  gst_number: string | null;
  verification_status: 'pending' | 'verified' | 'rejected';
  created_at: Date;
  updated_at: Date;
}

export interface OrganisationProfilesTable {
  id: string;
  organisation_id: string;
  support_email: string;
  support_phone: string;
  website_url: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  logo_url: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface BranchesTable {
  id: string;
  organisation_id: string;
  branch_code: string;
  name: string;
  is_headquarters: boolean;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  is_active: boolean;
  created_at: Date;
}

export interface WarehousesTable {
  id: string;
  organisation_id: string;
  branch_id: string | null;
  warehouse_code: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  is_active: boolean;
  created_at: Date;
}

export interface OrganisationConfigurationsTable {
  id: string;
  organisation_id: string;
  default_currency: string;
  timezone: string;
  allow_negative_stock: boolean;
  quotation_validity_days: number;
  settings: Record<string, unknown> | null;
  updated_at: Date;
}

export interface OrganisationMembershipsTable {
  id: string;
  organisation_id: string;
  user_id: string;
  membership_status: 'active' | 'suspended' | 'revoked';
  joined_at: Date;
  created_at: Date;
}

export interface MembershipInvitationsTable {
  id: string;
  organisation_id: string;
  email: string;
  phone: string | null;
  invited_by_user_id: string;
  invitation_token_hash: string;
  role_hints: Record<string, unknown>;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  expires_at: Date;
  accepted_at: Date | null;
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

export interface OrganisationDatabaseSchema {
  organisations: OrganisationsTable;
  organisation_profiles: OrganisationProfilesTable;
  branches: BranchesTable;
  warehouses: WarehousesTable;
  organisation_configurations: OrganisationConfigurationsTable;
  organisation_memberships: OrganisationMembershipsTable;
  membership_invitations: MembershipInvitationsTable;
  outbox_events: OutboxEventsTable;
}

export function createDatabaseClient(): Kysely<OrganisationDatabaseSchema> {
  const pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: 'organisation_db',
    user: config.database.user,
    password: config.database.password,
    min: config.database.poolMin,
    max: config.database.poolMax,
  });

  return new Kysely<OrganisationDatabaseSchema>({
    dialect: new PostgresDialect({ pool }),
  });
}

/**
 * Execute a callback within an isolated tenant transaction.
 * Strictly sets PostgreSQL session variable: `SET LOCAL app.current_organisation_id = :tenantId`
 */
export async function withTenantContext<T>(
  db: Kysely<OrganisationDatabaseSchema>,
  tenantId: string,
  callback: (trx: Kysely<OrganisationDatabaseSchema>) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (trx) => {
    // Set transaction-local tenant context for Row-Level Security
    await sql`SET LOCAL app.current_organisation_id = ${sql.raw(`'${tenantId}'`)}`.execute(trx);
    return callback(trx);
  });
}

/**
 * Migration runner: reads and executes all SQL migration files in order
 */
export async function runMigrations(db: Kysely<OrganisationDatabaseSchema>): Promise<void> {
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
