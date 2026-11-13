-- ==============================================================================
-- AETHRA Customer Service — Database Migration v1
-- Database: customer_db
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Customer Accounts (Vendor-Independent Identity)
CREATE TABLE IF NOT EXISTS customer_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_type TEXT NOT NULL DEFAULT 'individual' CHECK (account_type IN ('individual', 'commercial', 'industrial', 'society')),
    legal_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    pan_tax_id TEXT,
    gst_number TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_pan ON customer_accounts(pan_tax_id) WHERE pan_tax_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_gst ON customer_accounts(gst_number) WHERE gst_number IS NOT NULL;

-- 2. Customer Profiles
CREATE TABLE IF NOT EXISTS customer_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL UNIQUE REFERENCES customer_accounts(id) ON DELETE CASCADE,
    primary_email TEXT NOT NULL,
    primary_phone TEXT NOT NULL,
    alternate_phone TEXT,
    language_preference TEXT NOT NULL DEFAULT 'en',
    avatar_url TEXT,
    metadata JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Customer Contacts
CREATE TABLE IF NOT EXISTS customer_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
    contact_name TEXT NOT NULL,
    role_designation TEXT,
    email TEXT,
    phone TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_cust ON customer_contacts(customer_id);

-- 4. Customer User Linkage (Portal Access)
CREATE TABLE IF NOT EXISTS customer_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- Identity Service users.id
    customer_role TEXT NOT NULL DEFAULT 'owner' CHECK (customer_role IN ('owner', 'manager', 'viewer', 'family_member')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_customer_user UNIQUE (customer_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_users_user ON customer_users(user_id);

-- 5. Customer Real Estate Properties
CREATE TABLE IF NOT EXISTS customer_properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
    property_name TEXT NOT NULL,
    property_type TEXT NOT NULL CHECK (property_type IN ('residential', 'commercial', 'industrial', 'agricultural')),
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'IN',
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    discom_name TEXT,
    consumer_number TEXT,
    sanctioned_load_kw NUMERIC(10, 2),
    tariff_rate NUMERIC(10, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cust_props_customer ON customer_properties(customer_id);
CREATE INDEX IF NOT EXISTS idx_cust_props_geo ON customer_properties(postal_code, city);
CREATE INDEX IF NOT EXISTS idx_cust_props_consumer ON customer_properties(consumer_number) WHERE consumer_number IS NOT NULL;

-- 6. Property Installations (Rooftop solar, BESS, EV, etc.)
CREATE TABLE IF NOT EXISTS property_installations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES customer_properties(id) ON DELETE CASCADE,
    installation_name TEXT NOT NULL,
    system_type TEXT NOT NULL CHECK (system_type IN ('solar_rooftop', 'solar_ground', 'bess', 'ev_charging', 'hybrid')),
    grid_type TEXT NOT NULL DEFAULT 'on_grid' CHECK (grid_type IN ('on_grid', 'off_grid', 'hybrid', 'microgrid')),
    capacity_kw NUMERIC(10, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'under_construction', 'commissioned', 'operational', 'decommissioned')),
    commissioned_date DATE,
    commissioning_certificate_doc_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prop_inst_property ON property_installations(property_id);

-- 7. Property Equipment Assets
CREATE TABLE IF NOT EXISTS property_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    installation_id UUID NOT NULL REFERENCES property_installations(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES customer_properties(id) ON DELETE CASCADE,
    asset_type TEXT NOT NULL CHECK (asset_type IN ('solar_panel', 'inverter', 'battery', 'meter', 'charge_controller')),
    brand TEXT,
    model_number TEXT,
    serial_number TEXT,
    catalogue_product_id UUID,
    warranty_start_date DATE,
    warranty_end_date DATE,
    technical_specs JSONB,
    status TEXT NOT NULL DEFAULT 'operational' CHECK (status IN ('operational', 'degraded', 'faulty', 'replaced')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_assets_inst ON property_assets(installation_id);
CREATE INDEX IF NOT EXISTS idx_property_assets_serial ON property_assets(serial_number) WHERE serial_number IS NOT NULL;

-- 8. Property Access Delegations
CREATE TABLE IF NOT EXISTS property_access_delegations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES customer_properties(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    access_level TEXT NOT NULL DEFAULT 'read_only' CHECK (access_level IN ('read_only', 'manage_maintenance', 'full_property_admin')),
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prop_delegation_user ON property_access_delegations(user_id);

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

CREATE INDEX IF NOT EXISTS idx_cust_outbox_pending ON outbox_events(status, created_at) WHERE status = 'pending';
