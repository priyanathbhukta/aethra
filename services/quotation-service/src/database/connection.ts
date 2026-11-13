// ==============================================================================
// AETHRA Quotation Service — Database Connection Manager
// ==============================================================================

import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAppConfig } from '@aethra/config';

const { Pool } = pg;
const config = loadAppConfig('quotation-service', 3010);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface QuotationsTable {
  id: string;
  organisation_id: string;
  quotation_number: string;
  customer_id: string;
  property_id: string | null;
  lead_id: string | null;
  engineering_estimate_id: string | null;
  title: string;
  current_active_revision_id: string | null;
  accepted_revision_id: string | null;
  status: 'draft' | 'issued' | 'under_review' | 'accepted' | 'rejected' | 'expired' | 'superseded';
  created_at: Date;
  updated_at: Date;
}

export interface QuotationRevisionsTable {
  id: string;
  quotation_id: string;
  organisation_id: string;
  revision_number: number;
  status: 'draft' | 'issued' | 'accepted' | 'rejected' | 'expired' | 'superseded';
  valid_until: Date;
  subtotal_amount: number;
  total_discount_amount: number;
  total_tax_amount: number;
  total_payable_amount: number;
  estimated_subsidy_amount: number;
  net_customer_cost: number;
  internal_estimated_cost: number;
  internal_projected_margin: number;
  notes_customer: string | null;
  notes_internal: string | null;
  created_by_user_id: string;
  issued_at: Date | null;
  created_at: Date;
}

export interface QuotationLinesTable {
  id: string;
  revision_id: string;
  organisation_id: string;
  item_order: number;
  line_type: 'product' | 'service' | 'labour' | 'freight' | 'bos_package';
  catalogue_product_id: string | null;
  item_description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
  discount_amount: number;
  tax_rate_percent: number;
  tax_amount: number;
  net_amount: number;
  created_at: Date;
}

export interface PricingSnapshotsTable {
  id: string;
  quotation_line_id: string;
  revision_id: string;
  organisation_id: string;
  brand_name: string;
  model_code: string;
  display_name: string;
  technical_specs_snapshot: Record<string, unknown>;
  captured_unit_cost: number;
  captured_unit_price: number;
  captured_tax_rate: number;
  captured_at: Date;
}

export interface CustomerResponsesTable {
  id: string;
  quotation_id: string;
  revision_id: string;
  organisation_id: string;
  customer_user_id: string;
  decision: 'accept' | 'reject' | 'request_changes';
  customer_comments: string | null;
  signature_type: 'digital_click' | 'otp_verified' | 'signed_scan';
  signature_verification_token: string | null;
  ip_address: string;
  user_agent: string;
  responded_at: Date;
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

export interface QuotationDatabaseSchema {
  quotations: QuotationsTable;
  quotation_revisions: QuotationRevisionsTable;
  quotation_lines: QuotationLinesTable;
  pricing_snapshots: PricingSnapshotsTable;
  customer_responses: CustomerResponsesTable;
  outbox_events: OutboxEventsTable;
}

export function createDatabaseClient(): Kysely<QuotationDatabaseSchema> {
  const pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: 'quotation_db',
    user: config.database.user,
    password: config.database.password,
    min: config.database.poolMin,
    max: config.database.poolMax,
  });

  return new Kysely<QuotationDatabaseSchema>({
    dialect: new PostgresDialect({ pool }),
  });
}

export async function runMigrations(db: Kysely<QuotationDatabaseSchema>): Promise<void> {
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
