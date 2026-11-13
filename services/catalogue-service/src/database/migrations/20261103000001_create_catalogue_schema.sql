-- ==============================================================================
-- AETHRA Product Catalogue Service — Database Migration v1
-- Database: catalogue_db
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Product Categories (Hierarchy)
CREATE TABLE IF NOT EXISTS product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Brands
CREATE TABLE IF NOT EXISTS brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    origin_country TEXT NOT NULL DEFAULT 'IN',
    website_url TEXT,
    logo_url TEXT,
    is_verified BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Units
CREATE TABLE IF NOT EXISTS units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    unit_category TEXT NOT NULL CHECK (unit_category IN ('power', 'energy', 'electrical', 'dimension', 'weight', 'quantity'))
);

-- 4. Product Models (Global Master Specs)
CREATE TABLE IF NOT EXISTS product_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES product_categories(id),
    brand_id UUID NOT NULL REFERENCES brands(id),
    model_code TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    is_discontinued BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_models_cat ON product_models(category_id);
CREATE INDEX IF NOT EXISTS idx_product_models_brand ON product_models(brand_id);

-- 5. Product Specifications
CREATE TABLE IF NOT EXISTS product_specifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES product_categories(id),
    spec_key TEXT NOT NULL,
    label TEXT NOT NULL,
    data_type TEXT NOT NULL CHECK (data_type IN ('numeric', 'text', 'boolean', 'range')),
    default_unit_id UUID REFERENCES units(id),
    is_filterable BOOLEAN NOT NULL DEFAULT true,
    is_required BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_cat_spec_key UNIQUE (category_id, spec_key)
);

-- 6. Specification Values
CREATE TABLE IF NOT EXISTS specification_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES product_models(id) ON DELETE CASCADE,
    spec_id UUID NOT NULL REFERENCES product_specifications(id) ON DELETE CASCADE,
    text_value TEXT,
    numeric_value NUMERIC(14, 4),
    unit_id UUID REFERENCES units(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_model_spec UNIQUE (model_id, spec_id)
);

-- 7. Product Documents
CREATE TABLE IF NOT EXISTS product_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES product_models(id) ON DELETE CASCADE,
    doc_type TEXT NOT NULL CHECK (doc_type IN ('datasheet', 'installation_manual', 'warranty_card', 'certificate_bis', 'certificate_iec')),
    title TEXT NOT NULL,
    file_reference_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Warranty Templates
CREATE TABLE IF NOT EXISTS warranty_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES product_models(id) ON DELETE CASCADE,
    standard_warranty_months INT NOT NULL DEFAULT 12,
    performance_warranty_months INT DEFAULT 300,
    guaranteed_efficiency_percent NUMERIC(5, 2),
    terms_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Vendor Catalogue Entries (Private Tenant Pricing & Cost)
CREATE TABLE IF NOT EXISTS vendor_catalogue_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    model_id UUID NOT NULL REFERENCES product_models(id) ON DELETE CASCADE,
    vendor_sku TEXT NOT NULL,
    standard_cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    standard_selling_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    min_selling_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    tax_rate_percent NUMERIC(5, 2) NOT NULL DEFAULT 13.80,
    is_available BOOLEAN NOT NULL DEFAULT true,
    is_preferred BOOLEAN NOT NULL DEFAULT false,
    lead_time_days INT NOT NULL DEFAULT 3,
    vendor_notes JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_org_model UNIQUE (organisation_id, model_id),
    CONSTRAINT uq_org_sku UNIQUE (organisation_id, vendor_sku),
    CONSTRAINT chk_min_price CHECK (min_selling_price <= standard_selling_price)
);

CREATE INDEX IF NOT EXISTS idx_vendor_cat_org ON vendor_catalogue_entries(organisation_id);

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

CREATE INDEX IF NOT EXISTS idx_cat_outbox_pending ON outbox_events(status, created_at) WHERE status = 'pending';

-- Seed core units
INSERT INTO units (code, name, unit_category) VALUES
    ('Wp', 'Watt Peak', 'power'),
    ('kW', 'Kilowatt', 'power'),
    ('kWh', 'Kilowatt Hour', 'energy'),
    ('Ah', 'Ampere Hour', 'electrical'),
    ('V', 'Volt', 'electrical'),
    ('A', 'Ampere', 'electrical'),
    ('nos', 'Numbers / Pieces', 'quantity'),
    ('mtr', 'Meters', 'dimension')
ON CONFLICT (code) DO NOTHING;

-- Seed core categories
INSERT INTO product_categories (code, name, description) VALUES
    ('solar_pv_module', 'Solar PV Modules', 'Monocrystalline, Bifacial, Polycrystalline panels'),
    ('inverter', 'Solar Inverters', 'On-grid string, microinverters, hybrid inverters'),
    ('bess_battery', 'Battery Energy Storage (BESS)', 'Lithium-ion, LFP, lead acid battery packs'),
    ('mounting_structure', 'Module Mounting Structures (MMS)', 'Aluminium and GI roof and ground mounting racks'),
    ('bos', 'Balance of System (BOS)', 'DC/AC cables, ACDB, DCDB, lightning arresters, earthing')
ON CONFLICT (code) DO NOTHING;

-- Seed prominent renewable OEM brands
INSERT INTO brands (name, origin_country, is_verified) VALUES
    ('Waaree Energies', 'IN', true),
    ('Tata Power Solar', 'IN', true),
    ('Growatt', 'CN', true),
    ('Sungrow', 'CN', true),
    ('Enphase Energy', 'US', true)
ON CONFLICT (name) DO NOTHING;
