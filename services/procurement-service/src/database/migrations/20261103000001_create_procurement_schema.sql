-- ==============================================================================
-- AETHRA — Procurement Service Migration
-- Version: 20261103000001
-- Database: procurement_db
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    supplier_code VARCHAR(64) NOT NULL,
    legal_name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255),
    gst_number VARCHAR(32),
    pan_tax_id VARCHAR(32),
    contact_person VARCHAR(128) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(32) NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    payment_terms_default VARCHAR(32) NOT NULL DEFAULT 'net_30',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_suppliers_org_code UNIQUE (organisation_id, supplier_code)
);

CREATE INDEX IF NOT EXISTS idx_suppliers_org ON suppliers (organisation_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_gst ON suppliers (organisation_id, gst_number) WHERE gst_number IS NOT NULL;

-- 2. Purchase Requisitions
CREATE TABLE IF NOT EXISTS purchase_requisitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    requisition_code VARCHAR(64) NOT NULL,
    requested_by_user_id VARCHAR(128) NOT NULL,
    project_id UUID,
    destination_warehouse_id UUID NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'draft', -- draft, pending_approval, approved, rejected, converted_to_po
    urgency VARCHAR(32) NOT NULL DEFAULT 'medium', -- low, medium, high, critical
    required_by_date TIMESTAMPTZ NOT NULL,
    approved_by_user_id VARCHAR(128),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_requisitions_org_code UNIQUE (organisation_id, requisition_code)
);

-- 3. Purchase Requisition Lines
CREATE TABLE IF NOT EXISTS purchase_requisition_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requisition_id UUID NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
    organisation_id UUID NOT NULL,
    catalogue_product_id UUID NOT NULL,
    item_description TEXT NOT NULL,
    quantity NUMERIC(14, 2) NOT NULL,
    unit VARCHAR(32) NOT NULL DEFAULT 'NOS',
    estimated_unit_cost NUMERIC(14, 2),
    status VARCHAR(32) NOT NULL DEFAULT 'open'
);

-- 4. Purchase Orders (PO)
CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    po_number VARCHAR(64) NOT NULL,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    requisition_id UUID REFERENCES purchase_requisitions(id) ON DELETE SET NULL,
    destination_warehouse_id UUID NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'draft', -- draft, issued, confirmed, partially_received, fully_received, closed, cancelled
    order_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expected_delivery_date TIMESTAMPTZ NOT NULL,
    subtotal_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    payment_terms VARCHAR(64) NOT NULL DEFAULT 'net_30',
    shipping_terms VARCHAR(64) NOT NULL DEFAULT 'fob_site',
    created_by_user_id VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_pos_org_number UNIQUE (organisation_id, po_number)
);

CREATE INDEX IF NOT EXISTS idx_pos_org_supplier ON purchase_orders (organisation_id, supplier_id);

-- 5. Purchase Order Lines
CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    requisition_line_id UUID REFERENCES purchase_requisition_lines(id) ON DELETE SET NULL,
    organisation_id UUID NOT NULL,
    catalogue_product_id UUID NOT NULL,
    item_description TEXT NOT NULL,
    ordered_quantity NUMERIC(14, 2) NOT NULL,
    received_quantity NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    unit VARCHAR(32) NOT NULL DEFAULT 'NOS',
    unit_price NUMERIC(14, 2) NOT NULL,
    tax_rate_percent NUMERIC(5, 2) NOT NULL DEFAULT 13.80,
    line_total NUMERIC(14, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Goods Receipts (GRN)
CREATE TABLE IF NOT EXISTS goods_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    grn_code VARCHAR(64) NOT NULL,
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    destination_warehouse_id UUID NOT NULL,
    delivery_challan_number VARCHAR(128) NOT NULL,
    transporter_name VARCHAR(128),
    vehicle_number VARCHAR(64),
    inspection_status VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending, accepted, rejected, partial_defect
    inspected_by_user_id VARCHAR(128) NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_grn_org_code UNIQUE (organisation_id, grn_code)
);

CREATE INDEX IF NOT EXISTS idx_grn_po ON goods_receipts (organisation_id, po_id);

-- 7. Goods Receipt Lines
CREATE TABLE IF NOT EXISTS goods_receipt_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goods_receipt_id UUID NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
    po_line_id UUID NOT NULL REFERENCES purchase_order_lines(id) ON DELETE RESTRICT,
    organisation_id UUID NOT NULL,
    catalogue_product_id UUID NOT NULL,
    quantity_delivered NUMERIC(14, 2) NOT NULL,
    quantity_accepted NUMERIC(14, 2) NOT NULL,
    quantity_rejected NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    rejection_reason TEXT,
    batch_code VARCHAR(128),
    serial_numbers JSONB
);

-- 8. Supplier Invoices (3-Way Matching Audit)
CREATE TABLE IF NOT EXISTS supplier_invoice_references (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(128) NOT NULL,
    invoice_date DATE NOT NULL,
    invoice_amount NUMERIC(14, 2) NOT NULL,
    tax_amount NUMERIC(14, 2) NOT NULL,
    payment_status VARCHAR(32) NOT NULL DEFAULT 'unpaid', -- unpaid, partially_paid, paid
    document_file_id VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Transactional Outbox
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

CREATE INDEX IF NOT EXISTS idx_procurement_outbox_pending ON outbox_events (status, created_at) WHERE status = 'pending';

-- Row-Level Security
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_requisition_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_invoice_references ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'suppliers_vendor_isolation') THEN
        CREATE POLICY suppliers_vendor_isolation ON suppliers
            USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pos_vendor_isolation') THEN
        CREATE POLICY pos_vendor_isolation ON purchase_orders
            USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'grn_vendor_isolation') THEN
        CREATE POLICY grn_vendor_isolation ON goods_receipts
            USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);
    END IF;
END $$;
