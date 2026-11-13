-- ==============================================================================
-- AETHRA Organisation & Tenant Service — Database Migration v1
-- Database: organisation_db
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Organisations (Tenant Master Entity)
CREATE TABLE IF NOT EXISTS organisations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name TEXT NOT NULL,
    trade_name TEXT,
    status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'past_due', 'suspended', 'cancelled')),
    pan_tax_id TEXT,
    gst_number TEXT,
    verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_status ON organisations(status);
CREATE INDEX IF NOT EXISTS idx_org_gst ON organisations(gst_number) WHERE gst_number IS NOT NULL;

-- 2. Organisation Profiles (Tenant-Scoped with RLS)
CREATE TABLE IF NOT EXISTS organisation_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE UNIQUE,
    support_email TEXT NOT NULL,
    support_phone TEXT NOT NULL,
    website_url TEXT,
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'IN',
    logo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Business Categories (Platform Reference Data)
CREATE TABLE IF NOT EXISTS business_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- Seed initial categories
INSERT INTO business_categories (code, name, description) VALUES
    ('solar_epc', 'Solar EPC Contractor', 'Engineering, procurement and construction of solar power plants'),
    ('installer', 'Installation Contractor', 'Rooftop and ground mounting solar installation provider'),
    ('distributor', 'Distributor / Wholesaler', 'Distributor of solar modules, inverters and batteries'),
    ('om_provider', 'O&M Provider', 'Solar operations and annual maintenance contractor'),
    ('retailer', 'Retailer / Dealer', 'Retail equipment supplier')
ON CONFLICT (code) DO NOTHING;

-- 4. Organisation Business Categories (Join Table)
CREATE TABLE IF NOT EXISTS organisation_business_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES business_categories(id) ON DELETE CASCADE,
    CONSTRAINT uq_org_cat UNIQUE (organisation_id, category_id)
);

-- 5. Branches (Tenant-Scoped with RLS)
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    branch_code TEXT NOT NULL,
    name TEXT NOT NULL,
    is_headquarters BOOLEAN NOT NULL DEFAULT false,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_org_branch_code UNIQUE (organisation_id, branch_code)
);

CREATE INDEX IF NOT EXISTS idx_branches_org ON branches(organisation_id);

-- 6. Warehouses (Tenant-Scoped with RLS)
CREATE TABLE IF NOT EXISTS warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    warehouse_code TEXT NOT NULL,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_org_wh_code UNIQUE (organisation_id, warehouse_code)
);

CREATE INDEX IF NOT EXISTS idx_warehouses_org ON warehouses(organisation_id);

-- 7. Organisation Configurations (Tenant-Scoped with RLS)
CREATE TABLE IF NOT EXISTS organisation_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE UNIQUE,
    default_currency TEXT NOT NULL DEFAULT 'INR',
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    allow_negative_stock BOOLEAN NOT NULL DEFAULT false,
    quotation_validity_days INT NOT NULL DEFAULT 30,
    settings JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Organisation Memberships (Maps users to vendor organisations)
CREATE TABLE IF NOT EXISTS organisation_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    membership_status TEXT NOT NULL DEFAULT 'active' CHECK (membership_status IN ('active', 'suspended', 'revoked')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_org_user UNIQUE (organisation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON organisation_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_org ON organisation_memberships(organisation_id);

-- 9. Membership Invitations (Tenant-Scoped with RLS)
CREATE TABLE IF NOT EXISTS membership_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    phone TEXT,
    invited_by_user_id UUID NOT NULL,
    invitation_token_hash TEXT NOT NULL UNIQUE,
    role_hints JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invites_org ON membership_invitations(organisation_id);
CREATE INDEX IF NOT EXISTS idx_invites_token ON membership_invitations(invitation_token_hash);

-- 10. Transactional Outbox Events
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

CREATE INDEX IF NOT EXISTS idx_org_outbox_pending ON outbox_events(status, created_at) WHERE status = 'pending';

-- ==============================================================================
-- POSTGRESQL ROW-LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable and Force RLS on all tenant-owned tables
ALTER TABLE organisation_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches FORCE ROW LEVEL SECURITY;

ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses FORCE ROW LEVEL SECURITY;

ALTER TABLE organisation_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_configurations FORCE ROW LEVEL SECURITY;

ALTER TABLE organisation_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_memberships FORCE ROW LEVEL SECURITY;

ALTER TABLE membership_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_invitations FORCE ROW LEVEL SECURITY;

-- Policies evaluating transaction-scoped setting: app.current_organisation_id
CREATE POLICY rls_organisation_profiles ON organisation_profiles
    USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid)
    WITH CHECK (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);

CREATE POLICY rls_branches ON branches
    USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid)
    WITH CHECK (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);

CREATE POLICY rls_warehouses ON warehouses
    USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid)
    WITH CHECK (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);

CREATE POLICY rls_organisation_configurations ON organisation_configurations
    USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid)
    WITH CHECK (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);

CREATE POLICY rls_organisation_memberships ON organisation_memberships
    USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid)
    WITH CHECK (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);

CREATE POLICY rls_membership_invitations ON membership_invitations
    USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid)
    WITH CHECK (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);
