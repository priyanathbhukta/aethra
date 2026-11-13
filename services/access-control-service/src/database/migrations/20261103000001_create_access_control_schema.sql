-- ==============================================================================
-- AETHRA Access Control Service — Database Migration v1
-- Database: access_control_db
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Permissions Registry (Platform-wide standard permissions)
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    domain TEXT NOT NULL,
    resource TEXT NOT NULL,
    action TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perm_domain ON permissions(domain);

-- 2. Roles (System Default Roles + Tenant-Custom Roles)
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID, -- NULL for system roles, Org UUID for custom roles
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_system_role BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_role_code UNIQUE (organisation_id, code)
);

CREATE INDEX IF NOT EXISTS idx_roles_org ON roles(organisation_id);

-- 3. Role Permissions (Mapping of permissions to roles)
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    CONSTRAINT uq_role_perm UNIQUE (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_perm_role ON role_permissions(role_id);

-- 4. Membership Roles (Maps organisation membership to assigned roles)
CREATE TABLE IF NOT EXISTS membership_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    membership_id UUID NOT NULL,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_by_user_id UUID NOT NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_member_role UNIQUE (membership_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_member_roles_org ON membership_roles(organisation_id);
CREATE INDEX IF NOT EXISTS idx_member_roles_member ON membership_roles(membership_id);

-- 5. Access Scopes (ABAC: Restricts membership visibility to branch/warehouse/project)
CREATE TABLE IF NOT EXISTS access_scopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    membership_id UUID NOT NULL,
    scope_type TEXT NOT NULL CHECK (scope_type IN ('organisation', 'branch', 'warehouse', 'project', 'assignment')),
    scope_value TEXT NOT NULL, -- e.g. branch_id or 'all'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_member_scope UNIQUE (membership_id, scope_type, scope_value)
);

CREATE INDEX IF NOT EXISTS idx_scopes_org ON access_scopes(organisation_id);
CREATE INDEX IF NOT EXISTS idx_scopes_member ON access_scopes(membership_id);

-- 6. Resource Assignments (Direct assignments of users to leads, projects, tickets)
CREATE TABLE IF NOT EXISTS resource_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    user_id UUID NOT NULL,
    resource_type TEXT NOT NULL CHECK (resource_type IN ('lead', 'project', 'task', 'service_ticket')),
    resource_id UUID NOT NULL,
    role_on_resource TEXT NOT NULL DEFAULT 'assignee',
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_resource UNIQUE (user_id, resource_type, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_res_assign_user ON resource_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_res_assign_res ON resource_assignments(resource_type, resource_id);

-- 7. Temporary Privileged Access Grants (Time-bound elevated access)
CREATE TABLE IF NOT EXISTS temporary_access_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    user_id UUID NOT NULL,
    permission_code TEXT NOT NULL,
    reason TEXT NOT NULL,
    granted_by_user_id UUID NOT NULL,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_until TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_temp_grants_user ON temporary_access_grants(user_id, valid_until) WHERE revoked_at IS NULL;

-- 8. Policy Cache Invalidation Metadata
CREATE TABLE IF NOT EXISTS policy_cache_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL,
    version BIGINT NOT NULL DEFAULT 1,
    last_invalidated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_org_cache_ver UNIQUE (organisation_id)
);

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

CREATE INDEX IF NOT EXISTS idx_access_outbox_pending ON outbox_events(status, created_at) WHERE status = 'pending';

-- Seed core system permissions
INSERT INTO permissions (code, domain, resource, action, description) VALUES
    ('org.profile.read', 'organisation', 'profile', 'read', 'View organisation profile'),
    ('org.profile.update', 'organisation', 'profile', 'update', 'Update organisation profile'),
    ('org.member.invite', 'organisation', 'member', 'invite', 'Invite new employee'),
    ('org.member.manage', 'organisation', 'member', 'manage', 'Manage employee memberships'),
    ('org.branch.manage', 'organisation', 'branch', 'manage', 'Manage branches and warehouses'),
    ('access.role.assign', 'access', 'role', 'assign', 'Assign roles to staff members'),
    ('access.role.custom', 'access', 'role', 'custom', 'Create custom organisation roles'),
    ('subscription.plan.view', 'subscription', 'plan', 'view', 'View subscription status and quotas'),
    ('subscription.plan.manage', 'subscription', 'plan', 'manage', 'Manage plan tier and billing'),
    ('crm.lead.create', 'crm', 'lead', 'create', 'Create new sales lead'),
    ('crm.lead.view_all', 'crm', 'lead', 'view_all', 'View all organisation leads'),
    ('crm.lead.view_assigned', 'crm', 'lead', 'view_assigned', 'View assigned leads only'),
    ('quotation.create', 'quotation', 'quote', 'create', 'Create quotation draft'),
    ('quotation.issue', 'quotation', 'quote', 'issue', 'Issue frozen quotation to customer'),
    ('quotation.view_costing', 'quotation', 'quote', 'view_costing', 'View internal purchase costs and margins'),
    ('engineering.calc.run', 'engineering', 'calc', 'run', 'Run solar sizing calculations'),
    ('inventory.stock.view', 'inventory', 'stock', 'view', 'View inventory balances'),
    ('inventory.receipt.post', 'inventory', 'stock', 'receipt', 'Post goods receipt to ledger'),
    ('inventory.issue.post', 'inventory', 'stock', 'issue', 'Issue materials to project'),
    ('procurement.po.create', 'procurement', 'po', 'create', 'Draft purchase order'),
    ('procurement.po.approve', 'procurement', 'po', 'approve', 'Approve purchase order to supplier'),
    ('project.create', 'project', 'project', 'create', 'Initialize project from quote'),
    ('project.milestone.publish', 'project', 'milestone', 'publish', 'Publish milestone progress to customer'),
    ('service.ticket.create', 'service', 'ticket', 'create', 'Create service ticket'),
    ('service.ticket.resolve', 'service', 'ticket', 'resolve', 'Mark service ticket resolved')
ON CONFLICT (code) DO NOTHING;

-- Seed system roles
INSERT INTO roles (organisation_id, code, name, description, is_system_role) VALUES
    (NULL, 'platform_admin', 'Platform Administrator', 'Platform-wide administrator', true),
    (NULL, 'vendor_owner', 'Vendor Business Owner', 'Full operational and billing authority', true),
    (NULL, 'vendor_manager', 'Vendor Department Manager', 'Operational oversight and approvals', true),
    (NULL, 'vendor_employee', 'Vendor Staff / Technician', 'Standard operational field/desk execution', true),
    (NULL, 'customer_owner', 'Customer Account Owner', 'Customer signatory and property owner', true),
    (NULL, 'customer_property_user', 'Customer Delegated User', 'Customer site viewer', true)
ON CONFLICT DO NOTHING;
