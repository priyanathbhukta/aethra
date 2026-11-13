// ==============================================================================
// AETHRA Customer Service — Database Connection Manager
// ==============================================================================

import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAppConfig } from '@aethra/config';

const { Pool } = pg;
const config = loadAppConfig('customer-service', 3005);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CustomerAccountsTable {
  id: string;
  account_type: 'individual' | 'commercial' | 'industrial' | 'society';
  legal_name: string;
  display_name: string;
  pan_tax_id: string | null;
  gst_number: string | null;
  status: 'active' | 'suspended' | 'archived';
  created_at: Date;
  updated_at: Date;
}

export interface CustomerProfilesTable {
  id: string;
  customer_id: string;
  primary_email: string;
  primary_phone: string;
  alternate_phone: string | null;
  language_preference: string;
  avatar_url: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: Date;
}

export interface CustomerContactsTable {
  id: string;
  customer_id: string;
  contact_name: string;
  role_designation: string | null;
  email: string | null;
  phone: string;
  is_primary: boolean;
  created_at: Date;
}

export interface CustomerUsersTable {
  id: string;
  customer_id: string;
  user_id: string;
  customer_role: 'owner' | 'manager' | 'viewer' | 'family_member';
  is_active: boolean;
  linked_at: Date;
}

export interface CustomerPropertiesTable {
  id: string;
  customer_id: string;
  property_name: string;
  property_type: 'residential' | 'commercial' | 'industrial' | 'agricultural';
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  discom_name: string | null;
  consumer_number: string | null;
  sanctioned_load_kw: number | null;
  tariff_rate: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface PropertyInstallationsTable {
  id: string;
  property_id: string;
  installation_name: string;
  system_type: 'solar_rooftop' | 'solar_ground' | 'bess' | 'ev_charging' | 'hybrid';
  grid_type: 'on_grid' | 'off_grid' | 'hybrid' | 'microgrid';
  capacity_kw: number;
  status: 'planned' | 'under_construction' | 'commissioned' | 'operational' | 'decommissioned';
  commissioned_date: Date | null;
  commissioning_certificate_doc_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PropertyAssetsTable {
  id: string;
  installation_id: string;
  property_id: string;
  asset_type: 'solar_panel' | 'inverter' | 'battery' | 'meter' | 'charge_controller';
  brand: string | null;
  model_number: string | null;
  serial_number: string | null;
  catalogue_product_id: string | null;
  warranty_start_date: Date | null;
  warranty_end_date: Date | null;
  technical_specs: Record<string, unknown> | null;
  status: 'operational' | 'degraded' | 'faulty' | 'replaced';
  created_at: Date;
  updated_at: Date;
}

export interface PropertyAccessDelegationsTable {
  id: string;
  property_id: string;
  customer_id: string;
  user_id: string;
  access_level: 'read_only' | 'manage_maintenance' | 'full_property_admin';
  valid_until: Date | null;
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

export interface CustomerDatabaseSchema {
  customer_accounts: CustomerAccountsTable;
  customer_profiles: CustomerProfilesTable;
  customer_contacts: CustomerContactsTable;
  customer_users: CustomerUsersTable;
  customer_properties: CustomerPropertiesTable;
  property_installations: PropertyInstallationsTable;
  property_assets: PropertyAssetsTable;
  property_access_delegations: PropertyAccessDelegationsTable;
  outbox_events: OutboxEventsTable;
}

export function createDatabaseClient(): Kysely<CustomerDatabaseSchema> {
  const pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: 'customer_db',
    user: config.database.user,
    password: config.database.password,
    min: config.database.poolMin,
    max: config.database.poolMax,
  });

  return new Kysely<CustomerDatabaseSchema>({
    dialect: new PostgresDialect({ pool }),
  });
}

export async function runMigrations(db: Kysely<CustomerDatabaseSchema>): Promise<void> {
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
