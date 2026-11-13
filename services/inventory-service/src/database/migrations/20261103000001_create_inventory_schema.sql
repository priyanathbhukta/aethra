-- ==============================================================================
-- AETHRA — Inventory Service Migration
-- Version: 20261103000001
-- Database: inventory_db
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Warehouses (Tenant Synced Reference)
CREATE TABLE IF NOT EXISTS warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    warehouse_code VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_warehouses_org_code UNIQUE (organisation_id, warehouse_code)
);

CREATE INDEX IF NOT EXISTS idx_warehouses_org ON warehouses (organisation_id);

-- 2. Stock Balances (Derived snapshot guarded by pessimistic locks)
CREATE TABLE IF NOT EXISTS stock_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    catalogue_product_id UUID NOT NULL,
    on_hand_quantity NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    reserved_quantity NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    available_quantity NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    average_unit_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    last_movement_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_stock_balances_org_wh_prod UNIQUE (organisation_id, warehouse_id, catalogue_product_id),
    CONSTRAINT chk_stock_available_math CHECK (available_quantity = (on_hand_quantity - reserved_quantity))
);

CREATE INDEX IF NOT EXISTS idx_stock_balances_org_wh ON stock_balances (organisation_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_balances_prod ON stock_balances (catalogue_product_id);

-- 3. Stock Ledger Entries (Append-only immutable audit trail)
CREATE TABLE IF NOT EXISTS stock_ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    catalogue_product_id UUID NOT NULL,
    movement_type VARCHAR(32) NOT NULL, -- receipt, issue, transfer_in, transfer_out, adjustment, return
    quantity NUMERIC(14, 2) NOT NULL, -- positive for inflow, negative for outflow
    unit_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    balance_after NUMERIC(14, 2) NOT NULL,
    reference_doc_type VARCHAR(64) NOT NULL, -- goods_receipt, project_issue, transfer_order, physical_count
    reference_doc_id UUID NOT NULL,
    batch_id UUID,
    created_by_user_id VARCHAR(128) NOT NULL,
    posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_ledger_org_wh ON stock_ledger_entries (organisation_id, warehouse_id, catalogue_product_id, posted_at DESC);

-- 4. Stock Reservations (Earmarked for projects)
CREATE TABLE IF NOT EXISTS stock_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    catalogue_product_id UUID NOT NULL,
    project_id UUID NOT NULL,
    quantity_reserved NUMERIC(14, 2) NOT NULL,
    quantity_fulfilled NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(32) NOT NULL DEFAULT 'active', -- active, fulfilled, cancelled, expired
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_res_org_proj ON stock_reservations (organisation_id, project_id);

-- 5. Stock Receipts (Goods Inward)
CREATE TABLE IF NOT EXISTS stock_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    receipt_code VARCHAR(64) NOT NULL,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    purchase_order_id UUID,
    supplier_id UUID,
    status VARCHAR(32) NOT NULL DEFAULT 'draft', -- draft, inspected, posted, cancelled
    received_by_user_id VARCHAR(128) NOT NULL,
    posted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_receipt_org_code UNIQUE (organisation_id, receipt_code)
);

-- 6. Stock Issues (Material Outward to site)
CREATE TABLE IF NOT EXISTS stock_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    issue_code VARCHAR(64) NOT NULL,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    project_id UUID,
    reservation_id UUID REFERENCES stock_reservations(id) ON DELETE SET NULL,
    reason VARCHAR(64) NOT NULL DEFAULT 'project_installation',
    issued_to_user_id VARCHAR(128) NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_issue_org_code UNIQUE (organisation_id, issue_code)
);

-- 7. Serial Numbers Tracking
CREATE TABLE IF NOT EXISTS serial_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    catalogue_product_id UUID NOT NULL,
    serial_number VARCHAR(128) NOT NULL,
    current_warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
    assigned_project_id UUID,
    status VARCHAR(32) NOT NULL DEFAULT 'in_stock', -- in_stock, reserved, issued, installed, defective
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_serial_numbers_org_prod_sn UNIQUE (organisation_id, catalogue_product_id, serial_number)
);

CREATE INDEX IF NOT EXISTS idx_serial_numbers_lookup ON serial_numbers (organisation_id, serial_number);

-- 8. Transactional Outbox
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

CREATE INDEX IF NOT EXISTS idx_inventory_outbox_pending ON outbox_events (status, created_at) WHERE status = 'pending';

-- Row-Level Security
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE serial_numbers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'warehouses_vendor_isolation') THEN
        CREATE POLICY warehouses_vendor_isolation ON warehouses
            USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'stock_balances_vendor_isolation') THEN
        CREATE POLICY stock_balances_vendor_isolation ON stock_balances
            USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'stock_ledger_vendor_isolation') THEN
        CREATE POLICY stock_ledger_vendor_isolation ON stock_ledger_entries
            USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'stock_reservations_vendor_isolation') THEN
        CREATE POLICY stock_reservations_vendor_isolation ON stock_reservations
            USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);
    END IF;
END $$;
