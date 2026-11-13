// ==============================================================================
// AETHRA CRM Service — Database Connection Manager
// ==============================================================================

import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAppConfig } from '@aethra/config';

const { Pool } = pg;
const config = loadAppConfig('crm-service', 3007);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface LeadSourcesTable {
  id: string;
  organisation_id: string;
  name: string;
  channel_type: 'digital' | 'offline' | 'partner' | 'referral';
  is_active: boolean;
  created_at: Date;
}

export interface LeadStagesTable {
  id: string;
  organisation_id: string;
  name: string;
  stage_order: number;
  is_won: boolean;
  is_lost: boolean;
  is_active: boolean;
  created_at: Date;
}

export interface LeadsTable {
  id: string;
  organisation_id: string;
  lead_code: string;
  lead_source_id: string | null;
  current_stage_id: string;
  prospect_name: string;
  prospect_phone: string;
  prospect_email: string | null;
  prospect_type: 'residential' | 'commercial' | 'industrial' | 'agricultural';
  site_address: string | null;
  site_city: string | null;
  site_state: string | null;
  site_postal_code: string | null;
  estimated_monthly_bill: number | null;
  proposed_capacity_kw: number | null;
  budget_estimate: number | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'converted' | 'disqualified' | 'archived';
  assigned_agent_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface LeadAssignmentsTable {
  id: string;
  organisation_id: string;
  lead_id: string;
  assigned_to_user_id: string;
  assigned_by_user_id: string;
  assignment_notes: string | null;
  assigned_at: Date;
  unassigned_at: Date | null;
}

export interface LeadActivitiesTable {
  id: string;
  organisation_id: string;
  lead_id: string;
  activity_type: 'stage_change' | 'note_added' | 'call_logged' | 'email_sent' | 'site_visit' | 'quote_created';
  title: string;
  description: string | null;
  performed_by_user_id: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

export interface LeadFollowUpsTable {
  id: string;
  organisation_id: string;
  lead_id: string;
  assigned_to_user_id: string;
  scheduled_at: Date;
  follow_up_type: 'call' | 'site_visit' | 'meeting' | 'whatsapp' | 'email';
  reminder_note: string | null;
  status: 'pending' | 'completed' | 'rescheduled' | 'cancelled';
  completed_at: Date | null;
  completion_outcome: string | null;
  created_at: Date;
}

export interface LeadInteractionsTable {
  id: string;
  organisation_id: string;
  lead_id: string;
  channel: 'phone_call' | 'whatsapp' | 'email' | 'in_person';
  direction: 'inbound' | 'outbound';
  duration_seconds: number | null;
  summary: string;
  outcome: string | null;
  recorded_by_user_id: string;
  recorded_at: Date;
}

export interface LeadConversionsTable {
  id: string;
  organisation_id: string;
  lead_id: string;
  customer_id: string | null;
  quotation_id: string | null;
  converted_by_user_id: string;
  conversion_type: 'customer_only' | 'customer_and_quote' | 'direct_project';
  converted_at: Date;
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

export interface CrmDatabaseSchema {
  lead_sources: LeadSourcesTable;
  lead_stages: LeadStagesTable;
  leads: LeadsTable;
  lead_assignments: LeadAssignmentsTable;
  lead_activities: LeadActivitiesTable;
  lead_follow_ups: LeadFollowUpsTable;
  lead_interactions: LeadInteractionsTable;
  lead_conversions: LeadConversionsTable;
  outbox_events: OutboxEventsTable;
}

export function createDatabaseClient(): Kysely<CrmDatabaseSchema> {
  const pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: 'crm_db',
    user: config.database.user,
    password: config.database.password,
    min: config.database.poolMin,
    max: config.database.poolMax,
  });

  return new Kysely<CrmDatabaseSchema>({
    dialect: new PostgresDialect({ pool }),
  });
}

export async function runMigrations(db: Kysely<CrmDatabaseSchema>): Promise<void> {
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
