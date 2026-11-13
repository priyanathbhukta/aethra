-- ==============================================================================
-- AETHRA — Project Management Service Migration
-- Version: 20261103000001
-- Database: project_db
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Projects
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    project_code VARCHAR(64) NOT NULL,
    project_name VARCHAR(255) NOT NULL,
    customer_id UUID NOT NULL,
    property_id UUID NOT NULL,
    quotation_id UUID,
    accepted_quotation_revision_id UUID,
    project_type VARCHAR(64) NOT NULL DEFAULT 'residential_rooftop',
    capacity_kw NUMERIC(10, 2) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'initiated', -- initiated, site_survey, engineering, procurement, construction, inspection, commissioned, handover_complete, on_hold, cancelled
    planned_start_date DATE NOT NULL,
    planned_completion_date DATE NOT NULL,
    actual_start_date DATE,
    actual_completion_date DATE,
    project_manager_user_id VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_projects_org_code UNIQUE (organisation_id, project_code)
);

CREATE INDEX IF NOT EXISTS idx_projects_org ON projects (organisation_id);
CREATE INDEX IF NOT EXISTS idx_projects_cust ON projects (customer_id);

-- 2. Project Sites
CREATE TABLE IF NOT EXISTS project_sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    organisation_id UUID NOT NULL,
    site_contact_name VARCHAR(128) NOT NULL,
    site_contact_phone VARCHAR(32) NOT NULL,
    site_address TEXT NOT NULL,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    discom_subdivision VARCHAR(128),
    sanctioned_load_kw VARCHAR(32),
    discom_application_number VARCHAR(128),
    survey_completed_at TIMESTAMPTZ
);

-- 3. Milestones
CREATE TABLE IF NOT EXISTS milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    organisation_id UUID NOT NULL,
    milestone_name VARCHAR(255) NOT NULL,
    sequence_order INT NOT NULL DEFAULT 1,
    status VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, delayed
    target_date DATE NOT NULL,
    completed_date DATE,
    is_customer_visible BOOLEAN NOT NULL DEFAULT TRUE,
    weightage_percent NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_milestones_proj ON milestones (project_id, sequence_order);

-- 4. Tasks
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    organisation_id UUID NOT NULL,
    task_name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'todo', -- todo, in_progress, blocked, done, cancelled
    priority VARCHAR(32) NOT NULL DEFAULT 'medium', -- low, medium, high, critical
    start_date DATE,
    due_date DATE NOT NULL,
    finished_at DATE,
    estimated_hours NUMERIC(6, 2),
    actual_hours NUMERIC(6, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_milestone ON tasks (milestone_id);

-- 5. Task Assignments
CREATE TABLE IF NOT EXISTS task_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    organisation_id UUID NOT NULL,
    assigned_user_id VARCHAR(128) NOT NULL,
    role_on_task VARCHAR(32) NOT NULL DEFAULT 'lead', -- lead, assistant, inspector
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Handover Records (Commissioning sign-off)
CREATE TABLE IF NOT EXISTS handover_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    organisation_id UUID NOT NULL,
    handover_date DATE NOT NULL,
    discom_inspection_letter_doc_id VARCHAR(128),
    commissioning_report_doc_id VARCHAR(128) NOT NULL,
    warranty_pack_doc_id VARCHAR(128) NOT NULL,
    signed_off_by_vendor_user_id VARCHAR(128) NOT NULL,
    accepted_by_customer_user_id VARCHAR(128),
    customer_accepted_at TIMESTAMPTZ,
    customer_satisfaction_rating VARCHAR(16),
    handover_status VARCHAR(64) NOT NULL DEFAULT 'pending_customer_signature',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Customer Progress Views (Sanitized customer-facing projection)
CREATE TABLE IF NOT EXISTS customer_progress_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL,
    property_id UUID NOT NULL,
    overall_progress_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    current_phase_display VARCHAR(128) NOT NULL DEFAULT 'Initiation & Approvals',
    published_milestones JSONB NOT NULL,
    last_published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cust_progress_cust ON customer_progress_views (customer_id);

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

CREATE INDEX IF NOT EXISTS idx_project_outbox_pending ON outbox_events (status, created_at) WHERE status = 'pending';

-- Row-Level Security
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE handover_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_progress_views ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'projects_vendor_isolation') THEN
        CREATE POLICY projects_vendor_isolation ON projects
            USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'milestones_vendor_isolation') THEN
        CREATE POLICY milestones_vendor_isolation ON milestones
            USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);
    END IF;
END $$;
