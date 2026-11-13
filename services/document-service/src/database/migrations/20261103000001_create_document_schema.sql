-- ==============================================================================
-- AETHRA — Document & File Service Migration
-- Version: 20261103000001
-- Database: document_db
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. File Classifications
CREATE TABLE IF NOT EXISTS file_classifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    sensitivity_level VARCHAR(32) NOT NULL DEFAULT 'confidential', -- public, internal, confidential, restricted
    requires_malware_scan BOOLEAN NOT NULL DEFAULT TRUE
);

-- Seed classifications
INSERT INTO file_classifications (id, code, name, sensitivity_level, requires_malware_scan)
VALUES
    ('c1000000-0000-0000-0000-000000000001', 'quotation_proposal', 'Quotation Proposal PDF', 'confidential', TRUE),
    ('c1000000-0000-0000-0000-000000000002', 'site_photo', 'Site Survey Photos', 'internal', TRUE),
    ('c1000000-0000-0000-0000-000000000003', 'discom_letter', 'DISCOM Application / Sanction Letter', 'confidential', TRUE),
    ('c1000000-0000-0000-0000-000000000004', 'commissioning_cert', 'Commissioning Certificate', 'confidential', TRUE),
    ('c1000000-0000-0000-0000-000000000005', 'supplier_invoice', 'Supplier Tax Invoice', 'restricted', TRUE)
ON CONFLICT (code) DO NOTHING;

-- 2. Files Master
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID, -- NULL for global/public platform assets
    classification_id UUID NOT NULL REFERENCES file_classifications(id) ON DELETE RESTRICT,
    file_name VARCHAR(255) NOT NULL,
    s3_bucket VARCHAR(128) NOT NULL,
    s3_key VARCHAR(512) NOT NULL UNIQUE,
    content_type VARCHAR(128) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    sha256_hash VARCHAR(128) NOT NULL,
    uploaded_by_user_id VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_files_org ON files (organisation_id);

-- 3. Upload Sessions (Temporary presigned upload sessions)
CREATE TABLE IF NOT EXISTS upload_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    target_s3_key VARCHAR(512) NOT NULL,
    expected_content_type VARCHAR(128) NOT NULL,
    max_bytes BIGINT NOT NULL DEFAULT 52428800, -- 50 MB default
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending, completed, expired, aborted
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. File Access Policies
CREATE TABLE IF NOT EXISTS file_access_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    entity_type VARCHAR(64) NOT NULL, -- quotation, project, ticket, lead, catalogue
    entity_id UUID NOT NULL,
    permission_required VARCHAR(64) NOT NULL,
    allow_customer_access BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_policies_entity ON file_access_policies (entity_type, entity_id);

-- 5. File Processing State (Malware scan, thumbnail generation)
CREATE TABLE IF NOT EXISTS file_processing_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL UNIQUE REFERENCES files(id) ON DELETE CASCADE,
    scan_status VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending, clean, infected, failed
    scan_engine VARCHAR(64),
    scanned_at TIMESTAMPTZ,
    thumbnail_s3_key VARCHAR(512)
);

-- 6. Transactional Outbox
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

CREATE INDEX IF NOT EXISTS idx_doc_outbox_pending ON outbox_events (status, created_at) WHERE status = 'pending';

-- Row-Level Security
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_access_policies ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'files_vendor_isolation') THEN
        CREATE POLICY files_vendor_isolation ON files
            USING (organisation_id IS NULL OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);
    END IF;
END $$;
