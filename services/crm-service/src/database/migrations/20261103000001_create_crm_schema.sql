-- ==============================================================================
-- AETHRA CRM Service — Database Migration v1
-- Database: crm_db
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Lead Sources (Per-Tenant / System Master)
CREATE TABLE IF NOT EXISTS lead_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    name TEXT NOT NULL,
    channel_type TEXT NOT NULL DEFAULT 'digital' CHECK (channel_type IN ('digital', 'offline', 'partner', 'referral')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Lead Stages (Configurable Pipeline Stages)
CREATE TABLE IF NOT EXISTS lead_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    name TEXT NOT NULL,
    stage_order INT NOT NULL DEFAULT 1,
    is_won BOOLEAN NOT NULL DEFAULT false,
    is_lost BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_org_stage_order UNIQUE (organisation_id, stage_order)
);

-- 3. Leads (Core Prospect Records)
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    lead_code TEXT NOT NULL,
    lead_source_id UUID REFERENCES lead_sources(id) ON DELETE SET NULL,
    current_stage_id UUID NOT NULL REFERENCES lead_stages(id),
    prospect_name TEXT NOT NULL,
    prospect_phone TEXT NOT NULL,
    prospect_email TEXT,
    prospect_type TEXT NOT NULL DEFAULT 'residential' CHECK (prospect_type IN ('residential', 'commercial', 'industrial', 'agricultural')),
    site_address TEXT,
    site_city TEXT,
    site_state TEXT,
    site_postal_code TEXT,
    estimated_monthly_bill NUMERIC(12, 2),
    proposed_capacity_kw NUMERIC(10, 2),
    budget_estimate NUMERIC(12, 2),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'converted', 'disqualified', 'archived')),
    assigned_agent_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_leads_org_code UNIQUE (organisation_id, lead_code)
);

CREATE INDEX IF NOT EXISTS idx_leads_org_phone ON leads(organisation_id, prospect_phone);
CREATE INDEX IF NOT EXISTS idx_leads_stage_status ON leads(organisation_id, current_stage_id, status);

-- 4. Lead Assignments (Sales Rep Assignment Audit)
CREATE TABLE IF NOT EXISTS lead_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    assigned_to_user_id UUID NOT NULL,
    assigned_by_user_id UUID NOT NULL,
    assignment_notes TEXT,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    unassigned_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_lead_assign_agent ON lead_assignments(organisation_id, assigned_to_user_id);

-- 5. Lead Activities (Stage changes, notes, logged interactions)
CREATE TABLE IF NOT EXISTS lead_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL CHECK (activity_type IN ('stage_change', 'note_added', 'call_logged', 'email_sent', 'site_visit', 'quote_created')),
    title TEXT NOT NULL,
    description TEXT,
    performed_by_user_id UUID NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_act_lead ON lead_activities(lead_id);

-- 6. Lead Follow-ups
CREATE TABLE IF NOT EXISTS lead_follow_ups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    assigned_to_user_id UUID NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    follow_up_type TEXT NOT NULL DEFAULT 'call' CHECK (follow_up_type IN ('call', 'site_visit', 'meeting', 'whatsapp', 'email')),
    reminder_note TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rescheduled', 'cancelled')),
    completed_at TIMESTAMPTZ,
    completion_outcome TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Lead Interactions (Call / WhatsApp logs)
CREATE TABLE IF NOT EXISTS lead_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('phone_call', 'whatsapp', 'email', 'in_person')),
    direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
    duration_seconds INT,
    summary TEXT NOT NULL,
    outcome TEXT,
    recorded_by_user_id UUID NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Lead Conversions
CREATE TABLE IF NOT EXISTS lead_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    lead_id UUID NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
    customer_id UUID,
    quotation_id UUID,
    converted_by_user_id UUID NOT NULL,
    conversion_type TEXT NOT NULL DEFAULT 'customer_and_quote' CHECK (conversion_type IN ('customer_only', 'customer_and_quote', 'direct_project')),
    converted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Transactional Outbox Events
CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    topic TEXT NOT NULL,
    partition_key TEXT NOT NULL,
    payload JSONB NOT NULL,
    correlation_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'published', 'failed')),
    retry_count INT NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_outbox_pending ON outbox_events(status, created_at) WHERE status = 'pending';
