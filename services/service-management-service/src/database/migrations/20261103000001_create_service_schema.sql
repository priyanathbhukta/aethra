-- ==============================================================================
-- AETHRA — Service Management Service Migration
-- Version: 20261103000001
-- Database: service_db
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. AMC Contracts
CREATE TABLE IF NOT EXISTS amc_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    amc_code VARCHAR(64) NOT NULL,
    customer_id UUID NOT NULL,
    property_id UUID NOT NULL,
    installation_id UUID NOT NULL,
    contract_tier VARCHAR(32) NOT NULL DEFAULT 'preventive_only', -- comprehensive, non_comprehensive, preventive_only
    visits_per_year INT NOT NULL DEFAULT 4,
    contract_amount NUMERIC(14, 2) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active', -- active, expired, cancelled
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_amc_org_code UNIQUE (organisation_id, amc_code)
);

CREATE INDEX IF NOT EXISTS idx_amc_org_cust ON amc_contracts (organisation_id, customer_id);

-- 2. Service Tickets
CREATE TABLE IF NOT EXISTS service_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    ticket_number VARCHAR(64) NOT NULL,
    customer_id UUID NOT NULL,
    property_id UUID NOT NULL,
    installation_id UUID,
    amc_id UUID REFERENCES amc_contracts(id) ON DELETE SET NULL,
    ticket_type VARCHAR(64) NOT NULL, -- inverter_failure, panel_damage, generation_drop, grid_tripping, routine_check
    priority VARCHAR(32) NOT NULL DEFAULT 'medium', -- low, medium, high, critical
    status VARCHAR(32) NOT NULL DEFAULT 'open', -- open, assigned, in_progress, pending_parts, resolved, closed
    customer_reported_issue TEXT NOT NULL,
    created_by_user_id VARCHAR(128) NOT NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tickets_org_number UNIQUE (organisation_id, ticket_number)
);

CREATE INDEX IF NOT EXISTS idx_tickets_org ON service_tickets (organisation_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_customer ON service_tickets (customer_id);

-- 3. Ticket Events
CREATE TABLE IF NOT EXISTS ticket_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES service_tickets(id) ON DELETE CASCADE,
    organisation_id UUID NOT NULL,
    event_type VARCHAR(64) NOT NULL, -- status_change, comment_added, parts_requested
    summary TEXT NOT NULL,
    is_customer_visible BOOLEAN NOT NULL DEFAULT TRUE,
    actor_user_id VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Service Assignments
CREATE TABLE IF NOT EXISTS service_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES service_tickets(id) ON DELETE CASCADE,
    technician_user_id VARCHAR(128) NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'scheduled', -- scheduled, en_route, on_site, completed, rescheduled
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Service Visits
CREATE TABLE IF NOT EXISTS service_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES service_assignments(id) ON DELETE CASCADE,
    ticket_id UUID NOT NULL REFERENCES service_tickets(id) ON DELETE CASCADE,
    arrival_time TIMESTAMPTZ NOT NULL,
    departure_time TIMESTAMPTZ,
    site_observations TEXT NOT NULL,
    root_cause TEXT,
    corrective_action TEXT NOT NULL,
    customer_signoff_name VARCHAR(128),
    customer_signature_doc_id VARCHAR(128),
    signed_at TIMESTAMPTZ
);

-- 6. Parts Used (Warranty & AMC Tracking)
CREATE TABLE IF NOT EXISTS parts_used (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id UUID NOT NULL REFERENCES service_visits(id) ON DELETE CASCADE,
    organisation_id UUID NOT NULL,
    catalogue_product_id UUID NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1.00,
    serial_number_removed VARCHAR(128),
    serial_number_installed VARCHAR(128),
    warranty_status VARCHAR(64) NOT NULL DEFAULT 'covered_under_warranty', -- covered_under_warranty, chargeable, amc_covered
    billed_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00
);

-- 7. Transactional Outbox
CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(128) NOT NULL,
    topic VARCHAR(128) NOT NULL,
    partition_key VARCHAR(128) NOT NULL,
    payload JSONB NOT NULL,
    correlation_id VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    retry_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_service_outbox_pending ON outbox_events (status, created_at) WHERE status = 'pending';

-- Row-Level Security
ALTER TABLE amc_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts_used ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'amc_vendor_isolation') THEN
        CREATE POLICY amc_vendor_isolation ON amc_contracts
            USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tickets_vendor_isolation') THEN
        CREATE POLICY tickets_vendor_isolation ON service_tickets
            USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);
    END IF;
END $$;
