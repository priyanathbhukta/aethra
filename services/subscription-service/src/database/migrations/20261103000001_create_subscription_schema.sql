-- ==============================================================================
-- AETHRA Subscription & Entitlement Service — Database Migration v1
-- Database: subscription_db
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Module Catalogue (Platform Modules Master)
CREATE TABLE IF NOT EXISTS module_catalogue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    is_core BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Feature Catalogue (Granular measurable capabilities & limits)
CREATE TABLE IF NOT EXISTS feature_catalogue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    value_type TEXT NOT NULL CHECK (value_type IN ('boolean', 'numeric_limit', 'tier_enum')),
    default_value TEXT NOT NULL,
    module_id UUID REFERENCES module_catalogue(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Subscription Plans (Commercial Pricing Plans)
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual', 'quarterly')),
    price NUMERIC NOT NULL DEFAULT 0.00,
    currency TEXT NOT NULL DEFAULT 'INR',
    is_public BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Plan Modules (Modules included in a plan)
CREATE TABLE IF NOT EXISTS plan_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    module_id UUID NOT NULL REFERENCES module_catalogue(id) ON DELETE CASCADE,
    is_optional BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_plan_module UNIQUE (plan_id, module_id)
);

-- 5. Plan Features (Feature limit values bundled into a plan)
CREATE TABLE IF NOT EXISTS plan_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    feature_id UUID NOT NULL REFERENCES feature_catalogue(id) ON DELETE CASCADE,
    feature_value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_plan_feature UNIQUE (plan_id, feature_id)
);

-- 6. Organisation Subscriptions (Tenant Active Subscription)
CREATE TABLE IF NOT EXISTS organisation_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL UNIQUE,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id),
    status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'past_due', 'grace_period', 'suspended', 'cancelled')),
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    current_period_end TIMESTAMPTZ NOT NULL,
    trial_ends_at TIMESTAMPTZ,
    grace_period_ends_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    billing_contact_email TEXT,
    payment_metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_org ON organisation_subscriptions(organisation_id);
CREATE INDEX IF NOT EXISTS idx_sub_status ON organisation_subscriptions(status);

-- 7. Subscription Modules (Explicitly provisioned modules for the tenant)
CREATE TABLE IF NOT EXISTS subscription_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    subscription_id UUID NOT NULL REFERENCES organisation_subscriptions(id) ON DELETE CASCADE,
    module_id UUID NOT NULL REFERENCES module_catalogue(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'disabled')),
    activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    CONSTRAINT uq_sub_module UNIQUE (subscription_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_sub_modules_org ON subscription_modules(organisation_id);

-- 8. Entitlement Limits (Current usage vs max allowed quota)
CREATE TABLE IF NOT EXISTS entitlement_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    subscription_id UUID NOT NULL REFERENCES organisation_subscriptions(id) ON DELETE CASCADE,
    feature_code TEXT NOT NULL,
    max_allowed NUMERIC NOT NULL DEFAULT 0, -- -1 for unlimited
    current_usage NUMERIC NOT NULL DEFAULT 0,
    reset_cadence TEXT NOT NULL DEFAULT 'never' CHECK (reset_cadence IN ('never', 'daily', 'monthly', 'billing_cycle')),
    last_reset_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_org_feature UNIQUE (organisation_id, feature_code)
);

CREATE INDEX IF NOT EXISTS idx_entitlements_org ON entitlement_limits(organisation_id);

-- 9. Usage Records (Audit of quota increments)
CREATE TABLE IF NOT EXISTS usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    subscription_id UUID NOT NULL REFERENCES organisation_subscriptions(id) ON DELETE CASCADE,
    feature_code TEXT NOT NULL,
    quantity NUMERIC NOT NULL DEFAULT 1,
    idempotency_key TEXT NOT NULL UNIQUE,
    recorded_by TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_org ON usage_records(organisation_id, feature_code);

-- 10. Subscription Events (Audit history of upgrades, suspensions)
CREATE TABLE IF NOT EXISTS subscription_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    subscription_id UUID NOT NULL REFERENCES organisation_subscriptions(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    payload JSONB NOT NULL,
    triggered_by TEXT NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. Transactional Outbox Events
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

CREATE INDEX IF NOT EXISTS idx_sub_outbox_pending ON outbox_events(status, created_at) WHERE status = 'pending';

-- Seed core module catalogue
INSERT INTO module_catalogue (code, name, description, is_core) VALUES
    ('identity', 'Identity & Auth', 'Core user authentication', true),
    ('organisation', 'Organisation Management', 'Vendor tenant and branch setup', true),
    ('access_control', 'Access Control', 'RBAC and ABAC permissions', true),
    ('subscription', 'Subscriptions', 'Plans and billing management', true),
    ('crm', 'CRM & Leads', 'Pre-sales lead tracking and pipeline management', false),
    ('catalogue', 'Product Catalogue', 'Equipment specification catalog and pricing', false),
    ('quotation', 'Quotations & Proposals', 'Quotation drafting, pricing revisions, and customer acceptance', false),
    ('engineering', 'Solar Engineering & Sizing', 'Solar PV sizing, shadow analysis, and BOM generation', false),
    ('inventory', 'Inventory & Warehouse Ledger', 'Multi-warehouse stock ledger, serial tracking, and reservations', false),
    ('procurement', 'Procurement & Suppliers', 'Purchase orders and goods receipt management', false),
    ('project', 'Project Management', 'EPC milestone execution, tasks, and plant handover', false),
    ('service_management', 'O&M Service Management', 'Maintenance ticketing, AMC contracts, and technician visits', false),
    ('document', 'Document Storage', 'Private encrypted file management', true),
    ('notification', 'Notifications', 'Multi-channel messaging dispatch', true),
    ('reporting', 'Reports & Analytics', 'Operational rollups and data exports', false),
    ('integration', 'Integrations & Telemetry', 'Inverter IoT telemetry and payment gateways', false),
    ('audit', 'Audit Logging', 'Compliance audit journal', true),
    ('customer', 'Customer Management', 'Customer property and asset register', true),
    ('vendor_relationship', 'Vendor Customer Relationships', 'Multi-vendor relationship consent and grants', true)
ON CONFLICT (code) DO NOTHING;

-- Seed standard subscription plans
INSERT INTO subscription_plans (code, name, billing_cycle, price, currency) VALUES
    ('starter', 'AETHRA Starter Tier', 'monthly', 4999.00, 'INR'),
    ('professional', 'AETHRA Professional Tier', 'monthly', 14999.00, 'INR'),
    ('enterprise', 'AETHRA Enterprise Tier', 'monthly', 39999.00, 'INR')
ON CONFLICT (code) DO NOTHING;
