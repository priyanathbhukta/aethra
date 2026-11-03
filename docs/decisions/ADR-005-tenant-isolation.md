# ADR-005: Multi-Tenant Data Isolation Strategy (PostgreSQL Row-Level Security)

> Status: **Accepted**  
> Date: 2026-11-03  
> Deciders: Principal Database Architect, Application Security Engineer  

---

## 1. Context

AETHRA is a multi-tenant B2B2C SaaS platform. Competing solar EPC vendors store highly confidential commercial data on the platform, including:
- Private customer leads and contact information.
- Confidential equipment cost prices and supplier discount agreements.
- Target profit margins and proprietary pricing algorithms.
- Proprietary solar site engineering layouts and BOM designs.

A software bug or missing `WHERE organisation_id = :tenantId` clause in application code must **never** result in one vendor seeing another vendor's sensitive data.

At the same time, the system must accommodate end customers who legitimately hold relationships with *multiple* independent vendors (e.g. Vendor A for solar rooftop installation; Vendor B for battery energy storage).

## 2. Decision

We adopt a **Defense-in-Depth Multi-Tenant Isolation Strategy** centered on **PostgreSQL Row-Level Security (RLS)** reinforced by application-level guards:

1. **Mandatory Tenant Discriminator:**
   - Every tenant-owned table across all service databases includes a non-nullable `organisation_id UUID` column.
2. **PostgreSQL Row-Level Security (RLS):**
   - RLS is explicitly enabled on all tenant tables (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`).
   - Policies evaluate the transaction-scoped session variable:
     ```sql
     CREATE POLICY tenant_isolation_policy ON quotations
       USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);
     ```
3. **Transaction-Scoped Database Setting (`SET LOCAL`):**
   - Application connections obtain a connection from the pool, start a transaction, and execute `SET LOCAL app.current_organisation_id = :orgId;` before running any domain queries.
   - Using `SET LOCAL` guarantees that the tenant context automatically resets when the transaction commits or rolls back, completely eliminating connection-pool context leakage.
4. **Application Runtime Roles Cannot Bypass RLS:**
   - Database connection users (`aethra_quotation_user`, etc.) do **not** possess the `SUPERUSER` or `BYPASSRLS` attributes.
5. **Customer Multi-Vendor Separation:**
   - Customer records are not globally scoped to a single vendor.
   - Vendor access to customer properties and installations is strictly mediated through the **Vendor Relationship Service** via explicit grant records. Vendors only read customer data when an active, non-revoked grant exists.

## 3. Consequences

### Positive
- **Guaranteed Database-Level Enforcement:** Even if a developer accidentally forgets a `where organisation_id = ...` clause in an application query, the PostgreSQL query planner automatically appends the RLS filter, preventing data leakage.
- **Auditable & Provable Isolation:** Third-party security auditors can inspect and verify RLS policies directly in database migration files.
- **Connection Pool Safety:** `SET LOCAL` strictly isolates tenant context to the lifespan of individual transactions.

### Negative / Trade-offs
- Slight query performance overhead: PostgreSQL must evaluate the RLS policy condition on table scans (mitigated via compound indexes on `(organisation_id, id)`).
- Superusers and schema migration users must be strictly segregated from application runtime users.

## 4. Alternatives Considered

- **Database-per-Tenant:** Rejected. Provisioning hundreds of independent PostgreSQL databases for small vendor organizations introduces unsustainable infrastructure overhead and makes cross-tenant maintenance impossible.
- **Schema-per-Tenant:** Rejected. Managing thousands of PostgreSQL schemas leads to catalog bloat, slow connection startups, and complex schema migration rollouts across hundreds of active schemas.
- **Application-Only WHERE Filtering (No RLS):** Rejected due to high risk of developer error resulting in cross-tenant data exposure.
