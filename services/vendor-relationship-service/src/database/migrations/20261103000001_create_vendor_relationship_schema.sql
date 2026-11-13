-- ==============================================================================
-- AETHRA Vendor Relationship Service — Database Migration v1
-- Database: vendor_relationship_db
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Relationship Purposes (Operational Engagements)
CREATE TABLE IF NOT EXISTS relationship_purposes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT NOT NULL,
    legal_terms_url TEXT,
    requires_explicit_consent BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed standard renewable operational purposes
INSERT INTO relationship_purposes (code, display_name, description, requires_explicit_consent) VALUES
    ('epc_installation', 'Turnkey Solar EPC & Construction', 'Engineering site assessment, quotation revisions, bill of materials, and plant commissioning', true),
    ('amc_service', 'Solar Operations & Maintenance (AMC)', 'Preventive maintenance visits, inverter troubleshooting, and ticketing', true),
    ('energy_audit', 'Site Feasibility & Shadow Analysis', 'Pre-sales shadow simulation, tariff analysis, and layout generation', true),
    ('telemetry_monitoring', 'IoT Telemetry & Generation Monitoring', 'Real-time inverter solar generation and storage telemetry monitoring', true),
    ('retail_supply', 'Equipment Retail & Distribution', 'Supply of panels, inverters, and BOS packages directly to property', false)
ON CONFLICT (code) DO NOTHING;

-- 2. Vendor-Customer Relationships
CREATE TABLE IF NOT EXISTS vendor_customer_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL, -- Vendor Tenant ID
    customer_id UUID NOT NULL,     -- Customer Account ID
    purpose_id UUID NOT NULL REFERENCES relationship_purposes(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'revoked', 'terminated')),
    initiated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    activated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_vendor_customer_purpose UNIQUE (organisation_id, customer_id, purpose_id)
);

CREATE INDEX IF NOT EXISTS idx_rel_vendor_cust ON vendor_customer_relationships(organisation_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_rel_status ON vendor_customer_relationships(status);

-- 3. Relationship Invitations
CREATE TABLE IF NOT EXISTS relationship_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    customer_id UUID,
    invitation_type TEXT NOT NULL DEFAULT 'vendor_to_customer' CHECK (invitation_type IN ('vendor_to_customer', 'customer_to_vendor')),
    recipient_email TEXT,
    recipient_phone TEXT NOT NULL,
    invite_token_hash TEXT NOT NULL UNIQUE,
    purpose_id UUID NOT NULL REFERENCES relationship_purposes(id),
    proposed_scopes JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'accepted', 'declined', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Customer Consents (Auditable Digital Signatures)
CREATE TABLE IF NOT EXISTS customer_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    relationship_id UUID NOT NULL REFERENCES vendor_customer_relationships(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL,
    user_id UUID NOT NULL, -- Identity User ID of Signatory
    purpose_id UUID NOT NULL REFERENCES relationship_purposes(id),
    consent_version TEXT NOT NULL,
    consent_text_hash TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    user_agent TEXT NOT NULL,
    consent_method TEXT NOT NULL DEFAULT 'digital_signature' CHECK (consent_method IN ('digital_signature', 'otp_confirmation', 'contract_upload')),
    consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_until TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_consents_rel ON customer_consents(relationship_id);

-- 5. Vendor Access Grants (Base operational authorization)
CREATE TABLE IF NOT EXISTS vendor_access_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    relationship_id UUID NOT NULL REFERENCES vendor_customer_relationships(id) ON DELETE CASCADE,
    organisation_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    grant_type TEXT NOT NULL DEFAULT 'profile_read' CHECK (grant_type IN ('profile_read', 'profile_write', 'full_billing', 'site_engineering')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_grants_org_cust ON vendor_access_grants(organisation_id, customer_id) WHERE is_active = true;

-- 6. Property Access Grants (Scoped to specific properties)
CREATE TABLE IF NOT EXISTS property_access_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grant_id UUID NOT NULL REFERENCES vendor_access_grants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL, -- Customer Service customer_properties.id
    access_scope TEXT NOT NULL DEFAULT 'read_write' CHECK (access_scope IN ('read_only', 'read_write', 'engineering_only')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ,
    CONSTRAINT uq_grant_property UNIQUE (grant_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_prop_grants_active ON property_access_grants(property_id) WHERE is_active = true;

-- 7. Installation Access Grants (Scoped to specific equipment/solar rooftop installations)
CREATE TABLE IF NOT EXISTS installation_access_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_grant_id UUID NOT NULL REFERENCES property_access_grants(id) ON DELETE CASCADE,
    installation_id UUID NOT NULL, -- Customer Service property_installations.id
    access_scope TEXT NOT NULL DEFAULT 'operational_read' CHECK (access_scope IN ('operational_read', 'telemetry_read', 'service_write')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ
);

-- 8. Access Revocation History (Immutable Audit Log)
CREATE TABLE IF NOT EXISTS access_revocation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    relationship_id UUID NOT NULL REFERENCES vendor_customer_relationships(id) ON DELETE CASCADE,
    organisation_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    target_type TEXT NOT NULL CHECK (target_type IN ('relationship', 'property', 'installation', 'grant')),
    target_id UUID NOT NULL,
    revoked_by_role TEXT NOT NULL CHECK (revoked_by_role IN ('customer_owner', 'vendor_owner', 'platform_admin', 'system_auto')),
    revoked_by_user_id UUID NOT NULL,
    revocation_reason TEXT NOT NULL,
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revocations_rel ON access_revocation_history(relationship_id);
CREATE INDEX IF NOT EXISTS idx_revocations_org ON access_revocation_history(organisation_id);

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

CREATE INDEX IF NOT EXISTS idx_vr_outbox_pending ON outbox_events(status, created_at) WHERE status = 'pending';
