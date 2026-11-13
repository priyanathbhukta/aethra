-- ==============================================================================
-- AETHRA Audit Service — Database Migration v1
-- Database: audit_db
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Immutable Audit Events Ledger
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID,
    actor_user_id UUID,
    actor_role TEXT,
    client_ip TEXT,
    user_agent TEXT,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    request_correlation_id TEXT,
    before_state JSONB,
    after_state JSONB,
    result TEXT NOT NULL DEFAULT 'success' CHECK (result IN ('success', 'failure', 'denied')),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Compound Indexes for Fast Compliance Queries
CREATE INDEX IF NOT EXISTS idx_audit_org_time ON audit_events(organisation_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_correlation ON audit_events(request_correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_events(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_user_id, recorded_at DESC);

-- Strict Immutability: Prevent UPDATE and DELETE operations
CREATE OR REPLACE RULE no_audit_update AS ON UPDATE TO audit_events DO INSTEAD NOTHING;
CREATE OR REPLACE RULE no_audit_delete AS ON DELETE TO audit_events DO INSTEAD NOTHING;
