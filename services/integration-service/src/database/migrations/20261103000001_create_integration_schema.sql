-- ==============================================================================
-- AETHRA — Integration Service Migration
-- Version: 20261103000001
-- Database: integration_db
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Integration Providers
CREATE TABLE IF NOT EXISTS integration_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    provider_type VARCHAR(64) NOT NULL, -- payment_gateway, inverter_telemetry, messaging, gis
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Seed standard external providers
INSERT INTO integration_providers (id, provider_code, name, provider_type)
VALUES
    ('i1000000-0000-0000-0000-000000000001', 'razorpay', 'Razorpay Payment Gateway', 'payment_gateway'),
    ('i1000000-0000-0000-0000-000000000002', 'growatt_shine', 'Growatt ShineServer IoT Telemetry', 'inverter_telemetry'),
    ('i1000000-0000-0000-0000-000000000003', 'solis_cloud', 'Ginlong SolisCloud API', 'inverter_telemetry'),
    ('i1000000-0000-0000-0000-000000000004', 'whatsapp_meta', 'WhatsApp Cloud API / Gupshup', 'messaging')
ON CONFLICT (provider_code) DO NOTHING;

-- 2. Integration Connections
CREATE TABLE IF NOT EXISTS integration_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    provider_id UUID NOT NULL REFERENCES integration_providers(id) ON DELETE RESTRICT,
    connection_name VARCHAR(255) NOT NULL,
    encrypted_credentials_ref VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active', -- active, error, disconnected
    last_healthy_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connections_org ON integration_connections (organisation_id);

-- 3. Webhook Endpoints
CREATE TABLE IF NOT EXISTS webhook_endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
    endpoint_path VARCHAR(255) NOT NULL UNIQUE,
    signing_secret_ref VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Webhook Deliveries (Idempotent Intake Log)
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
    event_id_header VARCHAR(255),
    payload_hash VARCHAR(128) NOT NULL,
    payload JSONB NOT NULL,
    processing_status VARCHAR(32) NOT NULL DEFAULT 'received', -- received, processed, ignored, failed
    error_message TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_hash ON webhook_deliveries (endpoint_id, payload_hash);

-- 5. Sync Status (Telemetry polling cursor)
CREATE TABLE IF NOT EXISTS sync_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
    sync_domain VARCHAR(64) NOT NULL, -- inverter_telemetry, payment_reconciliation
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_cursor VARCHAR(255),
    records_processed INT NOT NULL DEFAULT 0
);

-- 6. Transactional Outbox
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

CREATE INDEX IF NOT EXISTS idx_integration_outbox_pending ON outbox_events (status, created_at) WHERE status = 'pending';

-- Row-Level Security
ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'connections_vendor_isolation') THEN
        CREATE POLICY connections_vendor_isolation ON integration_connections
            USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);
    END IF;
END $$;
