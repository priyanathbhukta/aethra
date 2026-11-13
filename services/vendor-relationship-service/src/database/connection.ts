// ==============================================================================
// AETHRA Vendor Relationship Service — Database Connection Manager
// ==============================================================================

import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAppConfig } from '@aethra/config';

const { Pool } = pg;
const config = loadAppConfig('vendor-relationship-service', 3006);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface RelationshipPurposesTable {
  id: string;
  code: string;
  display_name: string;
  description: string;
  legal_terms_url: string | null;
  requires_explicit_consent: boolean;
  created_at: Date;
}

export interface VendorCustomerRelationshipsTable {
  id: string;
  organisation_id: string;
  customer_id: string;
  purpose_id: string;
  status: 'pending' | 'active' | 'suspended' | 'revoked' | 'terminated';
  initiated_at: Date;
  activated_at: Date | null;
  expires_at: Date | null;
  revoked_at: Date | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface RelationshipInvitationsTable {
  id: string;
  organisation_id: string;
  customer_id: string | null;
  invitation_type: 'vendor_to_customer' | 'customer_to_vendor';
  recipient_email: string | null;
  recipient_phone: string;
  invite_token_hash: string;
  purpose_id: string;
  proposed_scopes: Record<string, unknown>;
  status: 'sent' | 'accepted' | 'declined' | 'expired';
  expires_at: Date;
  accepted_at: Date | null;
  created_at: Date;
}

export interface CustomerConsentsTable {
  id: string;
  relationship_id: string;
  customer_id: string;
  user_id: string;
  purpose_id: string;
  consent_version: string;
  consent_text_hash: string;
  ip_address: string;
  user_agent: string;
  consent_method: 'digital_signature' | 'otp_confirmation' | 'contract_upload';
  consented_at: Date;
  valid_until: Date | null;
  revoked_at: Date | null;
}

export interface VendorAccessGrantsTable {
  id: string;
  relationship_id: string;
  organisation_id: string;
  customer_id: string;
  grant_type: 'profile_read' | 'profile_write' | 'full_billing' | 'site_engineering';
  is_active: boolean;
  valid_from: Date;
  valid_until: Date | null;
  created_at: Date;
  revoked_at: Date | null;
}

export interface PropertyAccessGrantsTable {
  id: string;
  grant_id: string;
  property_id: string;
  access_scope: 'read_only' | 'read_write' | 'engineering_only';
  is_active: boolean;
  granted_at: Date;
  revoked_at: Date | null;
}

export interface InstallationAccessGrantsTable {
  id: string;
  property_grant_id: string;
  installation_id: string;
  access_scope: 'operational_read' | 'telemetry_read' | 'service_write';
  is_active: boolean;
  granted_at: Date;
  revoked_at: Date | null;
}

export interface AccessRevocationHistoryTable {
  id: string;
  relationship_id: string;
  organisation_id: string;
  customer_id: string;
  target_type: 'relationship' | 'property' | 'installation' | 'grant';
  target_id: string;
  revoked_by_role: 'customer_owner' | 'vendor_owner' | 'platform_admin' | 'system_auto';
  revoked_by_user_id: string;
  revocation_reason: string;
  revoked_at: Date;
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

export interface VendorRelationshipDatabaseSchema {
  relationship_purposes: RelationshipPurposesTable;
  vendor_customer_relationships: VendorCustomerRelationshipsTable;
  relationship_invitations: RelationshipInvitationsTable;
  customer_consents: CustomerConsentsTable;
  vendor_access_grants: VendorAccessGrantsTable;
  property_access_grants: PropertyAccessGrantsTable;
  installation_access_grants: InstallationAccessGrantsTable;
  access_revocation_history: AccessRevocationHistoryTable;
  outbox_events: OutboxEventsTable;
}

export function createDatabaseClient(): Kysely<VendorRelationshipDatabaseSchema> {
  const pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: 'vendor_relationship_db',
    user: config.database.user,
    password: config.database.password,
    min: config.database.poolMin,
    max: config.database.poolMax,
  });

  return new Kysely<VendorRelationshipDatabaseSchema>({
    dialect: new PostgresDialect({ pool }),
  });
}

export async function runMigrations(db: Kysely<VendorRelationshipDatabaseSchema>): Promise<void> {
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
