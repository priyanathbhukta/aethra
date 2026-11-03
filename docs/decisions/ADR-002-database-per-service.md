# ADR-002: Database-per-Service with Shared Infrastructure Cluster

> Status: **Accepted**  
> Date: 2026-11-03  
> Deciders: Principal Database Architect, Distributed Systems Architect  

---

## 1. Context

In a microservices architecture, data ownership is the most critical boundary. Sharing a single database across services creates invisible coupling, makes schema refactoring dangerous, allows uncoordinated table joins across service boundaries, and destroys data ownership.

However, provisioning 19 separate managed AWS RDS instances on Day 1 is cost-prohibitive (\$2,000+/month in baseline idle infrastructure) and operationally burdensome for initial staging and development environments.

## 2. Decision

We adopt a **Database-per-Service** pattern with a **Shared PostgreSQL Cluster** for initial deployment:

1. **Strict Logical & Credential Partitioning:**
   - 19 separate PostgreSQL databases are created on a single managed PostgreSQL 16 cluster (`identity_db`, `quotation_db`, `inventory_db`, etc.).
   - Each microservice is provisioned with a unique PostgreSQL database user with permissions granted *strictly* to its own database.
   - Cross-database queries (e.g. `dblink` or foreign data wrappers) and cross-database foreign keys are architecturally forbidden.
2. **Independent Migrations:**
   - Each microservice owns its own version-controlled SQL migration scripts. Migrations execute independently in the service's CI/CD pipeline.
3. **Seamless Migration Path to Dedicated Infrastructure:**
   - Because each database has zero shared tables, foreign keys, or schemas, any individual service database (such as high-traffic `inventory_db` or compute-heavy `reporting_db`) can be migrated to its own dedicated RDS instance or Aurora cluster at any time using `pg_dump`/`pg_restore` or AWS DMS with zero application code changes (only updating the connection string in AWS Secrets Manager).

## 3. Consequences

### Positive
- Strict data ownership and clear domain boundaries enforced from Day 1.
- Cost-effective infrastructure during MVP, beta, and initial customer onboarding.
- Smooth operational upgrade path to independent RDS clusters as individual services scale.
- Completely prevents accidental cross-service SQL joins in application code.

### Negative / Trade-offs
- The shared database cluster represents a shared hardware compute pool (CPU/RAM/IOPS) on Day 1. A rogue query in one database could impact adjacent services until connection pool limits and resource governors (`statement_timeout`) are enforced.
- Cross-service entity consistency must be managed via domain events rather than relational foreign key constraints.

## 4. Alternatives Considered

- **Single Shared Application Database with Shared Tables:** Rejected. Violates core microservice architecture rules and creates tight coupling.
- **Independent RDS Clusters for All 19 Services on Day 1:** Rejected due to excessive cost and maintenance overhead prior to reaching high-scale production load.
- **MongoDB / NoSQL as Primary Transactional Store:** Rejected. The core domain involves financial quotes, tax calculations, double-entry inventory ledgers, and audit trails that strictly demand ACID guarantees and relational integrity.
