// ==============================================================================
// AETHRA Subscription Service — Database Connection Manager
// ==============================================================================

import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAppConfig } from '@aethra/config';

const { Pool } = pg;
const config = loadAppConfig('subscription-service', 3004);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ModuleCatalogueTable {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_core: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface SubscriptionPlansTable {
  id: string;
  code: string;
  name: string;
  billing_cycle: 'monthly' | 'annual' | 'quarterly';
  price: number;
  currency: string;
  is_public: boolean;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface OrganisationSubscriptionsTable {
  id: string;
  organisation_id: string;
  plan_id: string;
  status: 'trial' | 'active' | 'past_due' | 'grace_period' | 'suspended' | 'cancelled';
  current_period_start: Date;
  current_period_end: Date;
  trial_ends_at: Date | null;
  grace_period_ends_at: Date | null;
  cancelled_at: Date | null;
  cancellation_reason: string | null;
  billing_contact_email: string | null;
  payment_metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface SubscriptionModulesTable {
  id: string;
  organisation_id: string;
  subscription_id: string;
  module_id: string;
  status: 'active' | 'suspended' | 'disabled';
  activated_at: Date;
  expires_at: Date | null;
}

export interface EntitlementLimitsTable {
  id: string;
  organisation_id: string;
  subscription_id: string;
  feature_code: string;
  max_allowed: number;
  current_usage: number;
  reset_cadence: 'never' | 'daily' | 'monthly' | 'billing_cycle';
  last_reset_at: Date | null;
  updated_at: Date;
}

export interface UsageRecordsTable {
  id: string;
  organisation_id: string;
  subscription_id: string;
  feature_code: string;
  quantity: number;
  idempotency_key: string;
  recorded_by: string | null;
  recorded_at: Date;
}

export interface PlanModulesTable {
  id: string;
  plan_id: string;
  module_id: string;
  is_optional: boolean;
  created_at: Date;
}

export interface SubscriptionEventsTable {
  id: string;
  organisation_id: string;
  subscription_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string;
  payload: Record<string, unknown>;
  triggered_by: string;
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

export interface SubscriptionDatabaseSchema {
  module_catalogue: ModuleCatalogueTable;
  subscription_plans: SubscriptionPlansTable;
  plan_modules: PlanModulesTable;
  organisation_subscriptions: OrganisationSubscriptionsTable;
  subscription_modules: SubscriptionModulesTable;
  entitlement_limits: EntitlementLimitsTable;
  usage_records: UsageRecordsTable;
  subscription_events: SubscriptionEventsTable;
  outbox_events: OutboxEventsTable;
}

export function createDatabaseClient(): Kysely<SubscriptionDatabaseSchema> {
  const pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: 'subscription_db',
    user: config.database.user,
    password: config.database.password,
    min: config.database.poolMin,
    max: config.database.poolMax,
  });

  return new Kysely<SubscriptionDatabaseSchema>({
    dialect: new PostgresDialect({ pool }),
  });
}

export async function runMigrations(db: Kysely<SubscriptionDatabaseSchema>): Promise<void> {
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
