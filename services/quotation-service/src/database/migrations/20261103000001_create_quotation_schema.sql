-- ==============================================================================
-- AETHRA Quotation Service — Database Migration v1
-- Database: quotation_db
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Quotations Master
CREATE TABLE IF NOT EXISTS quotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    quotation_number TEXT NOT NULL,
    customer_id UUID NOT NULL,
    property_id UUID,
    lead_id UUID,
    engineering_estimate_id UUID,
    title TEXT NOT NULL,
    current_active_revision_id UUID,
    accepted_revision_id UUID,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'under_review', 'accepted', 'rejected', 'expired', 'superseded')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_quot_org_number UNIQUE (organisation_id, quotation_number)
);

CREATE INDEX IF NOT EXISTS idx_quot_org ON quotations(organisation_id);
CREATE INDEX IF NOT EXISTS idx_quot_customer ON quotations(customer_id);

-- 2. Quotation Revisions (Strict Immutability Once Issued)
CREATE TABLE IF NOT EXISTS quotation_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    organisation_id UUID NOT NULL,
    revision_number INT NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'accepted', 'rejected', 'expired', 'superseded')),
    valid_until TIMESTAMPTZ NOT NULL,
    subtotal_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_payable_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    estimated_subsidy_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    net_customer_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    internal_estimated_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    internal_projected_margin NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    notes_customer TEXT,
    notes_internal TEXT,
    created_by_user_id UUID NOT NULL,
    issued_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_quot_rev_number UNIQUE (quotation_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_rev_quot ON quotation_revisions(quotation_id);

-- 3. Quotation Lines (Itemized Line Items)
CREATE TABLE IF NOT EXISTS quotation_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    revision_id UUID NOT NULL REFERENCES quotation_revisions(id) ON DELETE CASCADE,
    organisation_id UUID NOT NULL,
    item_order INT NOT NULL DEFAULT 1,
    line_type TEXT NOT NULL DEFAULT 'product' CHECK (line_type IN ('product', 'service', 'labour', 'freight', 'bos_package')),
    catalogue_product_id UUID,
    item_description TEXT NOT NULL,
    quantity NUMERIC(12, 2) NOT NULL DEFAULT 1.00,
    unit TEXT NOT NULL DEFAULT 'nos',
    unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    line_total NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    tax_rate_percent NUMERIC(5, 2) NOT NULL DEFAULT 13.80,
    tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    net_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quot_lines_rev ON quotation_lines(revision_id);

-- 4. Pricing Snapshots (Frozen Historical Specifications)
CREATE TABLE IF NOT EXISTS pricing_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_line_id UUID NOT NULL UNIQUE REFERENCES quotation_lines(id) ON DELETE CASCADE,
    revision_id UUID NOT NULL REFERENCES quotation_revisions(id) ON DELETE CASCADE,
    organisation_id UUID NOT NULL,
    brand_name TEXT NOT NULL,
    model_code TEXT NOT NULL,
    display_name TEXT NOT NULL,
    technical_specs_snapshot JSONB NOT NULL,
    captured_unit_cost NUMERIC(14, 2) NOT NULL,
    captured_unit_price NUMERIC(14, 2) NOT NULL,
    captured_tax_rate NUMERIC(5, 2) NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Customer Responses (Accept / Reject Audit)
CREATE TABLE IF NOT EXISTS customer_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    revision_id UUID NOT NULL REFERENCES quotation_revisions(id) ON DELETE CASCADE,
    organisation_id UUID NOT NULL,
    customer_user_id UUID NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ('accept', 'reject', 'request_changes')),
    customer_comments TEXT,
    signature_type TEXT NOT NULL DEFAULT 'digital_click' CHECK (signature_type IN ('digital_click', 'otp_verified', 'signed_scan')),
    signature_verification_token TEXT,
    ip_address TEXT NOT NULL,
    user_agent TEXT NOT NULL,
    responded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Transactional Outbox Events
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

CREATE INDEX IF NOT EXISTS idx_quot_outbox_pending ON outbox_events(status, created_at) WHERE status = 'pending';
