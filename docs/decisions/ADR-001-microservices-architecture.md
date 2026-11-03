# ADR-001: Adoption of Microservices Architecture

> Status: **Accepted**  
> Date: 2026-11-03  
> Deciders: Principal Distributed Systems Architect, Platform Engineering Team  

---

## 1. Context

AETHRA is an India-first B2B2C renewable energy SaaS platform serving competing vendor organizations (solar EPCs, installers, distributors, O&M providers) and their end customers. The technical design must support independent deployments, strict commercial data isolation between competing vendors, event-driven cross-organizational workflows, and future AI capabilities.

The initial technical proposal suggested a modular monolith. However, modular monoliths in large enterprise multi-tenant domains carry substantial long-term risks:
1. High risk of architectural erosion over time (accidental shared database queries, shared in-memory state, tight coupling).
2. Shared deployment lifecycles prevent autonomous release cadence across specialized business domains (e.g. fast-moving mobile CRM vs. mission-critical inventory ledgers).
3. Inability to scale compute-intensive workloads (e.g. 3D solar sizing and irradiance simulations) independently from standard I/O operations.

## 2. Decision

We will build AETHRA using a **microservices-first architecture** composed of 23 independently deployable bounded contexts.

Key architectural boundaries:
- Every microservice has a single business responsibility and independently owned codebase.
- No microservice will share database tables, schemas, or foreign keys with any other service.
- Synchronous communication is minimized; cross-service workflows are mediated via an Apache Kafka-compatible event streaming broker.
- Services are managed in a high-performance monorepo (pnpm workspaces + Turborepo) with independent CI/CD build and deploy targets.

## 3. Consequences

### Positive
- **Guaranteed Tenant & Domain Isolation:** Strong physical and logical boundaries prevent accidental cross-tenant data leaks.
- **Independent Scalability:** Engineering calculation services can scale CPU compute horizontally without allocating unneeded resources to CRM or Document services.
- **Autonomous Release Cycles:** Teams can deploy urgent inventory bugfixes or new quotation features without re-testing and deploying the entire platform.
- **Fault Tolerance:** Outages in third-party notification or integration webhooks do not disrupt ongoing site surveys or quote generation.

### Negative / Trade-offs
- Increased operational complexity: Requires distributed tracing (OpenTelemetry), centralized structured logging, and robust local orchestration (Docker Compose).
- Eventual consistency: Workflows spanning multiple services (e.g. quote acceptance to project initialization) require idempotent consumers and compensating saga mechanisms.

## 4. Alternatives Considered

- **Modular Monolith:** Rejected. While simpler in Day 1 development, it creates a single point of failure, couples database scaling across unrelated domains, and historically leads to leaky module abstractions in multi-tenant SaaS environments.
- **Full Serverless (AWS Lambda):** Rejected due to cold start latency concerns for complex NestJS domain models and high connection overhead against relational PostgreSQL databases.
