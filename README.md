# AETHRA — Microservices-First Platform Architecture

> **A Multi-Tenant Renewable Energy SaaS Platform (India-First B2B2C)**  
> **Phase 0 Deliverables · Master Architecture Index & Requirements Traceability**

---

## 1. Executive Summary

AETHRA is an enterprise-grade, multi-tenant B2B2C SaaS platform purpose-built for the Indian renewable energy sector (Solar EPC, rooftop solar, ground-mounted utility, battery energy storage systems [BESS], EV charging infrastructure, and asset operations & maintenance).

The platform is architected from the ground up as an **independently deployable, event-driven microservices architecture** operating on a unified TypeScript stack:
- **Backend:** NestJS 10.x, TypeScript 5.x, Node.js 20+ LTS
- **Data Stores:** PostgreSQL 16 (strict database-per-service pattern with Row-Level Security), Kysely type-safe query builder, Redis 7.x
- **Event Streaming:** Apache Kafka / Redpanda (transactional outbox and idempotent consumer inbox patterns)
- **Infrastructure:** AWS ECS Fargate, Multi-AZ RDS PostgreSQL, Amazon MSK, ElastiCache Redis, S3 private encrypted storage, CloudFront, Terraform
- **Clients:** Next.js 14+ (Web Desktop Dashboard) and React Native / Expo (Android & iOS)

---

## 2. Phase 0 Architecture Document Index

All 41 architectural and design documents have been authored and placed under `docs/`:

### 2.1 Distributed Architecture & System Context
1. [`docs/architecture/microservices-architecture.md`](docs/architecture/microservices-architecture.md) — Architectural overview, core laws, topology tiers, synchronous vs. asynchronous communication, and container model.
2. [`docs/architecture/service-boundaries.md`](docs/architecture/service-boundaries.md) — Complete bounded context profiles and responsibility matrix across all 23 microservices.
3. [`docs/architecture/system-context.md`](docs/architecture/system-context.md) — C4 Level 1 context diagram, user personas (vendor owners, solar engineers, technicians, customers), and third-party system boundaries.
4. [`docs/architecture/deployment-architecture.md`](docs/architecture/deployment-architecture.md) — AWS Mumbai (`ap-south-1`) VPC layout, multi-AZ subnets, ECS Fargate, RDS PostgreSQL, MSK Kafka, and disaster recovery.
5. [`docs/architecture/web-android-ios-architecture.md`](docs/architecture/web-android-ios-architecture.md) — Client scaffolding, Web BFF, Mobile BFF, offline-first sync for field technicians, and direct-to-S3 uploads.
6. [`docs/architecture/service-dependency-map.md`](docs/architecture/service-dependency-map.md) — Full service dependency graph, coupling matrix, critical path analysis, and circular dependency resolutions.

### 2.2 Database Architecture & Entity Relationship Diagrams (ERDs)
7. [`docs/database/database-per-service.md`](docs/database/database-per-service.md) — Database mapping across 19 logical databases, credential isolation, and migration paths.
8. [`docs/database/service-data-ownership.md`](docs/database/service-data-ownership.md) — Entity ownership matrix and cross-service reference standards.
9. [`docs/database/tenant-isolation.md`](docs/database/tenant-isolation.md) — PostgreSQL Row-Level Security (RLS) policies, transaction-scoped `SET LOCAL`, and connection pool safety.
10. [`docs/database/erd-identity-service.md`](docs/database/erd-identity-service.md) — `identity_db` ERD: user identities, OIDC provider bindings, and sessions.
11. [`docs/database/erd-organisation-service.md`](docs/database/erd-organisation-service.md) — `organisation_db` ERD: vendor tenants, branches, warehouses, and staff memberships.
12. [`docs/database/erd-access-control-service.md`](docs/database/erd-access-control-service.md) — `access_control_db` ERD: RBAC roles, permissions, scopes, and temporary grants.
13. [`docs/database/erd-subscription-service.md`](docs/database/erd-subscription-service.md) — `subscription_db` ERD: plans, modules, feature quotas, and usage metering.
14. [`docs/database/erd-customer-service.md`](docs/database/erd-customer-service.md) — `customer_db` ERD: customer accounts, properties, installations, and asset registers.
15. [`docs/database/erd-vendor-relationship-service.md`](docs/database/erd-vendor-relationship-service.md) — `vendor_relationship_db` ERD: multi-vendor consent, property access grants, and instant revocation.
16. [`docs/database/erd-crm-service.md`](docs/database/erd-crm-service.md) — `crm_db` ERD: vendor-private leads, stages, follow-ups, and conversion tracking.
17. [`docs/database/erd-catalogue-service.md`](docs/database/erd-catalogue-service.md) — `catalogue_db` ERD: global OEM solar specs and vendor-private cost/pricing tiers.
18. [`docs/database/erd-quotation-service.md`](docs/database/erd-quotation-service.md) — `quotation_db` ERD: immutable revisions, line items, frozen pricing snapshots, and acceptance.
19. [`docs/database/erd-engineering-service.md`](docs/database/erd-engineering-service.md) — `engineering_db` ERD: calculation profiles, versioned formulas, inputs/outputs, and BOM versions.
20. [`docs/database/erd-inventory-service.md`](docs/database/erd-inventory-service.md) — `inventory_db` ERD: append-only stock ledger, reservations, serials, and multi-warehouse balances.
21. [`docs/database/erd-procurement-service.md`](docs/database/erd-procurement-service.md) — `procurement_db` ERD: suppliers, requisitions, POs, and goods receipts.
22. [`docs/database/erd-project-service.md`](docs/database/erd-project-service.md) — `project_db` ERD: EPC construction milestones, tasks, handovers, and customer progress projections.
23. [`docs/database/erd-remaining-services.md`](docs/database/erd-remaining-services.md) — ERDs for `document_db`, `notification_db`, `service_db`, `reporting_db`, `integration_db`, and `audit_db`.

### 2.3 Security, Authorization & API Standards
24. [`docs/security/rbac-abac-design.md`](docs/security/rbac-abac-design.md) — Hybrid RBAC+ABAC model, permission taxonomy, distributed policy caching, and NestJS guards.
25. [`docs/security/service-to-service-security.md`](docs/security/service-to-service-security.md) — Zero-trust internal network, machine-to-machine JWTs, and database user isolation.
26. [`docs/api/api-standards.md`](docs/api/api-standards.md) — REST conventions, RFC 7807 problem details, idempotency headers, cursor pagination, and health probes.

### 2.4 Event-Driven Architecture & Sagas
27. [`docs/events/event-catalogue.md`](docs/events/event-catalogue.md) — Event specifications, Kafka topic naming, and partition key strategy across all domains.
28. [`docs/events/event-versioning.md`](docs/events/event-versioning.md) — Schema evolution, event envelopes, schema registry, and forward/backward compatibility.
29. [`docs/events/saga-workflows.md`](docs/events/saga-workflows.md) — Orchestration and compensation sequences for 7 core cross-service distributed sagas.

### 2.5 Architecture Decision Records (ADRs)
30. [`docs/decisions/ADR-001-microservices-architecture.md`](docs/decisions/ADR-001-microservices-architecture.md) — Adoption of microservices architecture over modular monolith.
31. [`docs/decisions/ADR-002-database-per-service.md`](docs/decisions/ADR-002-database-per-service.md) — Database-per-service with initial shared PostgreSQL infrastructure.
32. [`docs/decisions/ADR-003-event-streaming.md`](docs/decisions/ADR-003-event-streaming.md) — Kafka-compatible event streaming with outbox and inbox patterns.
33. [`docs/decisions/ADR-004-identity-provider.md`](docs/decisions/ADR-004-identity-provider.md) — OIDC provider abstraction with proposed AWS Cognito.
34. [`docs/decisions/ADR-005-tenant-isolation.md`](docs/decisions/ADR-005-tenant-isolation.md) — Multi-tenant data isolation using PostgreSQL Row-Level Security (RLS).
35. [`docs/decisions/ADR-006-api-gateway-and-bff.md`](docs/decisions/ADR-006-api-gateway-and-bff.md) — Two-tier ingress with dedicated Web and Mobile BFFs.
36. [`docs/decisions/ADR-007-vendor-customer-relationships.md`](docs/decisions/ADR-007-vendor-customer-relationships.md) — Explicit grant-based multi-vendor governance.
37. [`docs/decisions/ADR-008-technology-stack.md`](docs/decisions/ADR-008-technology-stack.md) — Standardized TypeScript, NestJS, Kysely, PostgreSQL, Redis, and ECS Fargate.

### 2.6 Operational Runbooks
38. [`docs/runbooks/local-development.md`](docs/runbooks/local-development.md) — Developer workstation setup, Docker Compose, pnpm Turborepo commands, and test runners.
39. [`docs/runbooks/deployment.md`](docs/runbooks/deployment.md) — GitHub Actions CI/CD pipelines, Docker container builds, ECS rolling updates, and Terraform.
40. [`docs/runbooks/database-migrations.md`](docs/runbooks/database-migrations.md) — Version-controlled SQL migration standards and expand/contract zero-downtime rollouts.
41. [`docs/runbooks/event-failure-recovery.md`](docs/runbooks/event-failure-recovery.md) — Retry policies, exponential backoff, dead-letter topics (`.dlq`), and replay runbooks.

---

## 3. Core Bounded Contexts Summary

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        AETHRA SaaS Core (23 Services)                 │
├────────────────────────────────┬───────────────────────────────────────┤
│ Tier 0: Ingress & Edge         │ API Gateway, Web BFF, Mobile BFF      │
│ Tier 1: Platform Foundation    │ Identity, Organisation, Access Control│
│                                │ Subscription & Entitlement, Audit     │
│ Tier 2: Governance Bridge      │ Customer Service, Vendor Relationship │
│ Tier 3: Core Pre-Sales         │ CRM, Catalogue, Engineering, Quotation│
│ Tier 4: Operations & EPC       │ Inventory, Procurement, Project Mgmt, │
│                                │ Document & S3, Service Management     │
│ Tier 5: Integration & AI       │ Notification, Reporting, Integration, │
│                                │ AI Gateway Boundary (Future)          │
└────────────────────────────────┴───────────────────────────────────────┘
```

---

## 4. Next Step: Phase 1 Readiness

Per the architectural roadmap, **Phase 0 (Architecture and Requirements Analysis) is complete**. 

Database migrations and frontend UI implementations have been intentionally paused pending formal architectural review of the data ownership matrix, event catalogue, and security models.
