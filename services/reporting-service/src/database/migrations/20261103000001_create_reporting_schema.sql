-- ==============================================================================
-- AETHRA — Reporting & Analytics Service Migration
-- Version: 20261103000001
-- Database: reporting_db
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Report Definitions
CREATE TABLE IF NOT EXISTS report_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_code VARCHAR(128) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(64) NOT NULL, -- sales, operations, inventory, financial, service
    parameters_schema JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed standard reports
INSERT INTO report_definitions (id, report_code, name, category, parameters_schema)
VALUES
    ('r1000000-0000-0000-0000-000000000001', 'sales_conversion_funnel', 'Sales & Lead Conversion Funnel', 'sales', '{"startDate": "string", "endDate": "string"}'),
    ('r1000000-0000-0000-0000-000000000002', 'inventory_valuation', 'Warehouse Stock Valuation & Aging', 'inventory', '{"warehouseId": "string"}'),
    ('r1000000-0000-0000-0000-000000000003', 'project_sla_delays', 'EPC Project Milestone & SLA Analytics', 'operations', '{"organisationId": "string"}')
ON CONFLICT (report_code) DO NOTHING;

-- 2. Report Projections (Precomputed Read Model)
CREATE TABLE IF NOT EXISTS report_projections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    projection_type VARCHAR(64) NOT NULL, -- monthly_sales, quarterly_installations, warranty_claims
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    aggregated_metrics JSONB NOT NULL,
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_projections UNIQUE (organisation_id, projection_type, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_projections_org ON report_projections (organisation_id, projection_type);

-- 3. Export Jobs (Asynchronous CSV, XLSX export)
CREATE TABLE IF NOT EXISTS export_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    report_id UUID NOT NULL REFERENCES report_definitions(id) ON DELETE RESTRICT,
    requested_by_user_id VARCHAR(128) NOT NULL,
    filter_parameters JSONB NOT NULL DEFAULT '{}',
    export_format VARCHAR(16) NOT NULL DEFAULT 'csv', -- csv, xlsx, pdf
    status VARCHAR(32) NOT NULL DEFAULT 'queued', -- queued, processing, completed, failed
    download_file_id VARCHAR(128),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_org ON export_jobs (organisation_id, status);

-- 4. Analytics Aggregations (Time-series Rollups)
CREATE TABLE IF NOT EXISTS analytics_aggregations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    metric_name VARCHAR(128) NOT NULL,
    metric_value NUMERIC(14, 2) NOT NULL,
    snapshot_date DATE NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_analytics_agg UNIQUE (organisation_id, metric_name, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_analytics_agg_date ON analytics_aggregations (organisation_id, snapshot_date DESC);

-- 5. Transactional Outbox
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

CREATE INDEX IF NOT EXISTS idx_reporting_outbox_pending ON outbox_events (status, created_at) WHERE status = 'pending';

-- Row-Level Security
ALTER TABLE report_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_aggregations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'projections_vendor_isolation') THEN
        CREATE POLICY projections_vendor_isolation ON report_projections
            USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);
    END IF;
END $$;
