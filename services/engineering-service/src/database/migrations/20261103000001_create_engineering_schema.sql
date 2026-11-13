-- ==============================================================================
-- AETHRA Engineering & Estimation Service — Database Migration v1
-- Database: engineering_db
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Calculation Profiles (Standards & Guidelines)
CREATE TABLE IF NOT EXISTS calculation_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID, -- NULL for platform global defaults
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    system_category TEXT NOT NULL CHECK (system_category IN ('rooftop_solar', 'ground_mount', 'bess', 'hybrid')),
    region_code TEXT NOT NULL DEFAULT 'IN',
    is_global BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Calculation Profile Versions (Formula Immutability)
CREATE TABLE IF NOT EXISTS calculation_profile_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES calculation_profiles(id) ON DELETE CASCADE,
    version_tag TEXT NOT NULL,
    formula_definitions JSONB NOT NULL,
    input_parameter_schema JSONB NOT NULL,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_to TIMESTAMPTZ,
    is_locked BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT uq_prof_version UNIQUE (profile_id, version_tag)
);

-- 3. Engineering Estimates
CREATE TABLE IF NOT EXISTS engineering_estimates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    estimate_code TEXT NOT NULL,
    profile_version_id UUID NOT NULL REFERENCES calculation_profile_versions(id),
    customer_id UUID,
    property_id UUID,
    lead_id UUID,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'calculated', 'approved', 'superseded')),
    calculated_by_user_id UUID NOT NULL,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_est_org_code UNIQUE (organisation_id, estimate_code)
);

CREATE INDEX IF NOT EXISTS idx_est_org ON engineering_estimates(organisation_id);
CREATE INDEX IF NOT EXISTS idx_est_customer ON engineering_estimates(customer_id) WHERE customer_id IS NOT NULL;

-- 4. Engineering Inputs (Exact Parameter Snapshot)
CREATE TABLE IF NOT EXISTS engineering_inputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    estimate_id UUID NOT NULL REFERENCES engineering_estimates(id) ON DELETE CASCADE,
    parameter_key TEXT NOT NULL,
    parameter_name TEXT NOT NULL,
    numeric_value NUMERIC(14, 4),
    text_value TEXT,
    complex_value JSONB,
    unit TEXT NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_est_param UNIQUE (estimate_id, parameter_key)
);

-- 5. Calculation Outputs
CREATE TABLE IF NOT EXISTS calculation_outputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    estimate_id UUID NOT NULL REFERENCES engineering_estimates(id) ON DELETE CASCADE,
    metric_key TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    metric_value NUMERIC(14, 4) NOT NULL,
    unit TEXT NOT NULL,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_est_metric UNIQUE (estimate_id, metric_key)
);

-- 6. Calculation Assumptions
CREATE TABLE IF NOT EXISTS calculation_assumptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    estimate_id UUID NOT NULL REFERENCES engineering_estimates(id) ON DELETE CASCADE,
    assumption_key TEXT NOT NULL,
    description TEXT NOT NULL,
    value NUMERIC(14, 4) NOT NULL,
    unit TEXT NOT NULL,
    source TEXT NOT NULL,
    CONSTRAINT uq_est_assumption UNIQUE (estimate_id, assumption_key)
);

-- 7. Bill of Materials (BOM Master)
CREATE TABLE IF NOT EXISTS bill_of_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    estimate_id UUID NOT NULL REFERENCES engineering_estimates(id) ON DELETE CASCADE,
    organisation_id UUID NOT NULL,
    bom_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'finalized')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_bom_org_code UNIQUE (organisation_id, bom_code)
);

-- 8. BOM Versions
CREATE TABLE IF NOT EXISTS bom_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bom_id UUID NOT NULL REFERENCES bill_of_materials(id) ON DELETE CASCADE,
    version_number INT NOT NULL DEFAULT 1,
    notes TEXT,
    created_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_bom_version UNIQUE (bom_id, version_number)
);

-- 9. BOM Items
CREATE TABLE IF NOT EXISTS bom_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bom_version_id UUID NOT NULL REFERENCES bom_versions(id) ON DELETE CASCADE,
    organisation_id UUID NOT NULL,
    item_category TEXT NOT NULL CHECK (item_category IN ('solar_module', 'inverter', 'mounting_structure', 'dc_cable', 'ac_cable', 'ajb', 'earthing', 'bos')),
    catalogue_product_id UUID,
    item_name TEXT NOT NULL,
    specification_summary TEXT,
    quantity NUMERIC(10, 2) NOT NULL,
    unit TEXT NOT NULL DEFAULT 'nos',
    is_mandatory BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Engineering Disclaimers
CREATE TABLE IF NOT EXISTS engineering_disclaimers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES calculation_profiles(id) ON DELETE CASCADE,
    display_order INT NOT NULL DEFAULT 1,
    disclaimer_text TEXT NOT NULL,
    is_mandatory BOOLEAN NOT NULL DEFAULT true
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

CREATE INDEX IF NOT EXISTS idx_eng_outbox_pending ON outbox_events(status, created_at) WHERE status = 'pending';

-- Seed default MNRE Residential Profile
DO $$
DECLARE
    v_profile_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
    v_version_id UUID := '00000000-0000-0000-0000-000000000002'::uuid;
BEGIN
    INSERT INTO calculation_profiles (id, code, name, system_category, is_global, is_active)
    VALUES (v_profile_id, 'in_mnre_residential_v1', 'India MNRE Standard Solar Rooftop Calculation Profile', 'rooftop_solar', true, true)
    ON CONFLICT (code) DO NOTHING;

    INSERT INTO calculation_profile_versions (id, profile_id, version_tag, formula_definitions, input_parameter_schema, is_locked)
    VALUES (
        v_version_id,
        v_profile_id,
        'v1.0',
        '{"specific_yield_kwh_kwp": 1500, "derate_factor": 0.78, "co2_factor_kg_kwh": 0.82, "sqm_per_kw": 10.0}'::jsonb,
        '{"required": ["sanction_load_kw", "roof_usable_area_sqm"]}'::jsonb,
        true
    )
    ON CONFLICT (profile_id, version_tag) DO NOTHING;
END $$;
