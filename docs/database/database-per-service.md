# AETHRA — Database-per-Service Strategy

> Phase 0 · Database Architecture · v0.1.0

---

## 1. Database Mapping

Every microservice owns exactly one PostgreSQL database. No service reads from or writes to another service's database directly — all cross-service data access is via APIs or domain events.

| # | Service | Database Name | Owned Entities (Tables) |
|---|---------|---------------|------------------------|
| 1 | Identity Service | `identity_db` | `users`, `user_auth_providers`, `email_verifications`, `phone_verifications`, `account_recovery`, `user_sessions` |
| 2 | Organisation Service | `organisation_db` | `organisations`, `organisation_profiles`, `business_categories`, `organisation_business_categories`, `branches`, `warehouses`, `organisation_configurations`, `organisation_memberships`, `membership_invitations` |
| 3 | Access Control Service | `access_control_db` | `roles`, `permissions`, `role_permissions`, `membership_roles`, `access_scopes`, `resource_assignments`, `policy_cache_metadata`, `temporary_access_grants` |
| 4 | Subscription Service | `subscription_db` | `subscription_plans`, `plan_modules`, `plan_features`, `module_catalogue`, `feature_catalogue`, `organisation_subscriptions`, `subscription_modules`, `entitlement_limits`, `usage_records`, `subscription_events` |
| 5 | Customer Service | `customer_db` | `customer_accounts`, `customer_profiles`, `customer_contacts`, `customer_users`, `customer_properties`, `property_installations`, `property_assets`, `property_access_delegations` |
| 6 | Vendor Relationship Service | `vendor_relationship_db` | `vendor_customer_relationships`, `relationship_invitations`, `customer_consents`, `relationship_purposes`, `vendor_access_grants`, `property_access_grants`, `installation_access_grants`, `access_revocation_history` |
| 7 | CRM Service | `crm_db` | `leads`, `lead_sources`, `lead_stages`, `lead_assignments`, `lead_activities`, `lead_follow_ups`, `lead_interactions`, `lead_conversions` |
| 8 | Product Catalogue Service | `catalogue_db` | `product_categories`, `brands`, `product_models`, `product_specifications`, `specification_values`, `units`, `product_documents`, `warranty_templates`, `vendor_catalogue_entries` |
| 9 | Quotation Service | `quotation_db` | `quotations`, `quotation_revisions`, `quotation_lines`, `pricing_snapshots`, `quotation_discounts`, `quotation_taxes`, `payment_terms`, `customer_responses`, `quotation_documents` |
| 10 | Engineering & Estimation Service | `engineering_db` | `calculation_profiles`, `calculation_profile_versions`, `engineering_inputs`, `engineering_estimates`, `calculation_outputs`, `calculation_assumptions`, `bill_of_materials`, `bom_versions`, `bom_items`, `engineering_disclaimers` |
| 11 | Inventory Service | `inventory_db` | `stock_ledger_entries`, `stock_balances`, `warehouses`, `stock_reservations`, `stock_transfers`, `stock_receipts`, `stock_issues`, `stock_returns`, `stock_adjustments`, `batch_numbers`, `serial_numbers`, `project_allocations` |
| 12 | Procurement Service | `procurement_db` | `suppliers`, `purchase_requisitions`, `purchase_requisition_lines`, `purchase_orders`, `purchase_order_lines`, `goods_receipts`, `goods_receipt_lines`, `supplier_invoice_references` |
| 13 | Project Management Service | `project_db` | `projects`, `project_sites`, `milestones`, `tasks`, `task_dependencies`, `task_assignments`, `project_events`, `handover_records`, `customer_progress_views` |
| 14 | Document Service | `document_db` | `files`, `upload_sessions`, `file_access_policies`, `file_classifications`, `file_processing_state`, `retention_policies` |
| 15 | Notification Service | `notification_db` | `notification_preferences`, `notification_templates`, `notification_deliveries`, `delivery_attempts`, `in_app_notifications` |
| 16 | Service Management Service | `service_db` | `service_tickets`, `ticket_events`, `service_assignments`, `service_visits`, `warranty_references`, `amc_contracts`, `parts_used` |
| 17 | Reporting Service | `reporting_db` | `report_definitions`, `report_projections`, `export_jobs`, `analytics_aggregations` |
| 18 | Integration Service | `integration_db` | `integration_providers`, `integration_connections`, `webhook_endpoints`, `webhook_deliveries`, `integration_logs`, `sync_status` |
| 19 | Audit Service | `audit_db` | `audit_events` |

---

## 2. PostgreSQL Cluster Topology (Initial)

### 2.1 Shared Cluster — Day 1

```
┌─────────────────────────────────────────────────────────┐
│               PostgreSQL 16 Shared Cluster              │
│                                                         │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────────┐  │
│  │ identity_db │ │ organisation │ │ access_control   │  │
│  │             │ │ _db          │ │ _db              │  │
│  └─────────────┘ └──────────────┘ └──────────────────┘  │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────────┐  │
│  │subscription │ │ customer_db  │ │vendor_relationship│  │
│  │_db          │ │              │ │_db               │  │
│  └─────────────┘ └──────────────┘ └──────────────────┘  │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────────┐  │
│  │  crm_db     │ │ catalogue_db │ │ quotation_db     │  │
│  └─────────────┘ └──────────────┘ └──────────────────┘  │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────────┐  │
│  │engineering  │ │ inventory_db │ │ procurement_db   │  │
│  │_db          │ │              │ │                  │  │
│  └─────────────┘ └──────────────┘ └──────────────────┘  │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────────┐  │
│  │ project_db  │ │ document_db  │ │ notification_db  │  │
│  └─────────────┘ └──────────────┘ └──────────────────┘  │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────────┐  │
│  │ service_db  │ │ reporting_db │ │ integration_db   │  │
│  └─────────────┘ └──────────────┘ └──────────────────┘  │
│  ┌─────────────┐                                        │
│  │ audit_db    │                                        │
│  └─────────────┘                                        │
│                                                         │
│  Primary: 1 × (8 vCPU, 32 GB RAM, 500 GB NVMe SSD)     │
│  Replica: 1 × streaming replica (hot standby)           │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Rationale for Shared Cluster on Day 1

- Simplifies operational burden during early product phase.
- 19 databases on one cluster keeps DevOps surface small.
- Each database is logically isolated via separate credentials, schemas, and `pg_hba.conf` rules.
- Physical isolation is deferred until traffic/data volumes warrant it.

### 2.3 Recommended Instance Sizing (Initial)

| Component | Specification |
|-----------|---------------|
| Engine | PostgreSQL 16 |
| Primary | 8 vCPU · 32 GB RAM · 500 GB gp3 SSD |
| Read Replica | 1 × streaming replica (async, promote-on-fail) |
| Region | ap-south-1 (Mumbai) |
| Managed Service | AWS RDS or Aurora PostgreSQL |

---

## 3. Credential Isolation Strategy

### 3.1 Principles

1. **One service ⟹ one PostgreSQL role** — no shared credentials.
2. Each role has `CONNECT` granted only on its own database.
3. Each role owns a `service` schema within its database (not `public`).
4. The `public` schema is revoked from all service roles.
5. A `migrations` role per database has DDL privileges; the application role does not.

### 3.2 Role Naming Convention

```
svc_<service_name>          — application role (DML only)
mig_<service_name>          — migration role (DDL + DML)
ro_<service_name>           — read-only role (SELECT only, for debugging/reporting)
```

### 3.3 Example: Identity Service

```sql
-- Create roles
CREATE ROLE svc_identity LOGIN PASSWORD '***' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE mig_identity LOGIN PASSWORD '***' NOSUPERUSER NOCREATEDB NOCREATEROLE;

-- Grant database access
GRANT CONNECT ON DATABASE identity_db TO svc_identity;
GRANT CONNECT ON DATABASE identity_db TO mig_identity;

-- Revoke public access
REVOKE ALL ON DATABASE identity_db FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;

-- Service schema
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION mig_identity;

-- Application role: DML only
GRANT USAGE ON SCHEMA app TO svc_identity;
ALTER DEFAULT PRIVILEGES FOR ROLE mig_identity IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO svc_identity;
ALTER DEFAULT PRIVILEGES FOR ROLE mig_identity IN SCHEMA app
  GRANT USAGE ON SEQUENCES TO svc_identity;

-- Migration role: full DDL on app schema
GRANT ALL ON SCHEMA app TO mig_identity;
```

### 3.4 Credential Storage

| Environment | Store | Rotation |
|-------------|-------|----------|
| Local dev | `.env` files (gitignored) | Manual |
| CI/CD | GitHub Actions secrets / pipeline vault | Per pipeline |
| Staging / Prod | AWS Secrets Manager or HashiCorp Vault | Automatic 90-day rotation |

---

## 4. Migration Strategy per Service

### 4.1 Tooling

- **Recommended**: [golang-migrate/migrate](https://github.com/golang-migrate/migrate) or [Flyway](https://flywaydb.org/) — framework-agnostic, SQL-first.
- Each service maintains its own `migrations/` directory in its repository.

### 4.2 Migration File Convention

```
migrations/
  V001__create_users_table.sql
  V002__add_user_sessions.sql
  V003__add_index_on_email.sql
```

### 4.3 Execution Rules

| Rule | Detail |
|------|--------|
| Lock | Use advisory lock (`SELECT pg_advisory_lock(...)`) to prevent concurrent migration runs |
| Direction | Forward-only in production; down migrations available in dev |
| Versioning | Monotonically increasing integer prefix |
| DDL Safety | All DDL operations must be non-blocking (`CREATE INDEX CONCURRENTLY`, no `ALTER TABLE ... ADD COLUMN ... DEFAULT` on large tables without care) |
| Review | Every migration reviewed and tested against production-like data volumes |
| Rollback | Each migration accompanied by a rollback script; rollbacks tested before production deploy |

### 4.4 RLS Policy Migrations

Tenant-isolation RLS policies are deployed as standard migrations. The migration role (`mig_*`) owns the policies. Policies reference `current_setting('app.current_tenant')`.

### 4.5 Per-Service Migration Isolation

Services run migrations independently. There is no cross-database migration dependency. If Service B depends on a new event shape from Service A, the dependency is on the **API/event contract**, not on the schema migration.

---

## 5. Connection Pooling Strategy

### 5.1 Architecture

```
Service Pod ──► PgBouncer (sidecar or shared) ──► PostgreSQL
```

### 5.2 Pooler Configuration

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Pooler | PgBouncer 1.22+ | Lightweight, battle-tested |
| Pool Mode | `transaction` | Allows connection reuse between transactions; required for RLS `SET LOCAL` pattern |
| `max_client_conn` | 200 per database | Handles burst from service replicas |
| `default_pool_size` | 20 per database | Keeps PostgreSQL backend count manageable |
| `reserve_pool_size` | 5 per database | Overflow buffer |
| `server_idle_timeout` | 300s | Reclaim idle backends |
| `server_lifetime` | 3600s | Rotate backends to pick up configuration changes |

### 5.3 Deployment Model

| Phase | Model |
|-------|-------|
| Day 1 | One PgBouncer deployment per service (sidecar in Kubernetes pod) |
| Scale-out | Shared PgBouncer fleet with per-database routing |

### 5.4 RLS Safety with Pooling

> [!CAUTION]
> When using `transaction` pool mode, `SET LOCAL` resets at transaction end. This is the desired behavior for tenant context — the setting does NOT leak to the next transaction on the same backend connection. Services **MUST** set tenant context at the start of every transaction, never rely on session-level settings.

```sql
BEGIN;
SET LOCAL app.current_tenant = 'org_abc123';
-- All queries in this transaction are tenant-scoped
COMMIT; -- SET LOCAL is automatically discarded
```

---

## 6. Scaling Path — When to Split Clusters

### 6.1 Trigger Criteria

| Signal | Threshold | Action |
|--------|-----------|--------|
| CPU sustained | > 70% for 7 days | Investigate; plan split |
| Storage growth | > 60% of provisioned | Expand storage or split |
| Connection count | > 80% of `max_connections` | Split high-traffic databases |
| Query latency p99 | > 200 ms on critical paths | Profile; consider split |
| Compliance / data residency | Regulatory requirement | Immediate split |

### 6.2 Recommended Split Order

Databases with the highest I/O and independent workloads should split first:

| Priority | Database(s) | Reason |
|----------|-------------|--------|
| 1 | `audit_db` | Append-only, high write volume, immutable — benefits from dedicated WAL throughput |
| 2 | `inventory_db` | Hot path for stock movements, concurrency-sensitive |
| 3 | `quotation_db`, `engineering_db` | Document-like payloads, JSONB columns, computation-heavy |
| 4 | `crm_db`, `project_db` | Moderate write load, tenant-heavy |
| 5 | Remaining | Split on observed need |

### 6.3 Split Procedure

1. Provision new PostgreSQL cluster.
2. Set up logical replication from shared cluster → new cluster for the target database.
3. Validate data consistency.
4. Update service configuration (connection string, PgBouncer target).
5. Perform blue-green cutover during maintenance window.
6. Drop replication slot on old cluster.

---

## 7. Backup and Recovery per Database

### 7.1 Backup Strategy

| Layer | Mechanism | Frequency | Retention |
|-------|-----------|-----------|-----------|
| Full physical | `pg_basebackup` or managed snapshot (RDS automated) | Daily | 30 days |
| WAL archiving | Continuous WAL archival to S3 (via `pgBackRest` or RDS) | Continuous | 30 days |
| Logical per-database | `pg_dump` per database | Daily | 14 days |
| Point-in-time recovery | WAL replay to any second | Up to retention window | 30 days |

### 7.2 Per-Database Recovery

Because all 19 databases live on one cluster initially, recovery options are:

| Scenario | Method |
|----------|--------|
| Single table corruption | Restore `pg_dump` of affected database to a scratch instance → extract table → reimport |
| Single database loss | Restore from `pg_dump` backup |
| Full cluster failure | Promote streaming replica; if replica unavailable, PITR from physical backup + WAL |
| Accidental data deletion | PITR to point before deletion → extract affected rows |

### 7.3 RPO / RTO Targets

| Metric | Target (Day 1) | Target (Scale) |
|--------|-----------------|-----------------|
| RPO | ≤ 5 minutes (WAL archival lag) | ≤ 1 minute |
| RTO | ≤ 30 minutes (replica promote) | ≤ 5 minutes (multi-AZ failover) |

### 7.4 Audit Database Special Handling

> [!IMPORTANT]
> `audit_db` contains tamper-resistant append-only records. Logical backups of `audit_db` must be integrity-verified (row-count + checksum) after restore. No `DELETE` or `TRUNCATE` privileges are granted to any role on `audit_events`.

### 7.5 Encryption

| At Rest | In Transit |
|---------|------------|
| AES-256 via AWS RDS encryption (KMS managed key) | TLS 1.3 enforced on all connections (`sslmode=verify-full`) |

---

## Open Decisions

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | PgBouncer deployment model | Sidecar per pod vs. shared fleet | Start with sidecar; evaluate shared fleet at 50+ pods |
| 2 | Managed vs. self-hosted PostgreSQL | AWS RDS / Aurora vs. self-managed on EC2/K8s | RDS for Day 1; Aurora if read-replica fan-out needed |
| 3 | Logical replication for reporting_db | Replicate from source databases vs. event-sourced ETL | Event-sourced ETL preferred for decoupling |
| 4 | Backup tooling | pgBackRest vs. RDS native | RDS native for Day 1; pgBackRest if self-hosted |
