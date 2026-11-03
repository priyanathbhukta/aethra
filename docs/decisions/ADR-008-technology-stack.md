# ADR-008: Core Technology Stack Selection

> Status: **Accepted**  
> Date: 2026-11-03  
> Deciders: Principal Architect, Engineering Leadership  

---

## 1. Context

Selecting the foundational programming language, runtime, frameworks, database drivers, and cloud orchestration tools dictates the engineering velocity, developer experience, type safety, operational maintainability, and scalability of the AETHRA platform for the next decade.

The platform requires:
- Strict end-to-end type safety across backend microservices, contracts, web, and mobile.
- High-performance asynchronous non-blocking I/O.
- Enterprise-grade dependency injection, modularity, and testability.
- Fast compilation and unified monorepo management.

## 2. Decision

We establish the following standard technology stack for the AETHRA platform:

| Layer | Selected Technology | Technical Justification |
|---|---|---|
| **Language** | **TypeScript 5.x** | End-to-end type safety across backend, web, and mobile. Shared DTOs and contracts eliminate serialization mismatches. |
| **Backend Runtime** | **Node.js 20+ LTS** | Battle-tested, high-concurrency event-driven runtime with extensive ecosystem support. |
| **Backend Framework** | **NestJS 10.x** | Enterprise architecture with modular structure, first-class dependency injection, decorators, OpenAPI integration, and built-in support for microservices and Kafka transports. |
| **Web Application** | **Next.js 14+ (App Router) + React** | Server-side rendering (SSR), fast initial paint, optimized SEO for public landing pages, and rapid desktop dashboard composition. |
| **Mobile Applications** | **React Native + Expo SDK** | Unified cross-platform codebase for Android and iOS with native performance, over-the-air updates, and extensive camera/hardware access for field technicians. |
| **Database & Engine** | **PostgreSQL 16** | Proven ACID guarantees, strong JSONB capabilities, native Row-Level Security (RLS), and extension support (`pgcrypto`, `pgvector`). |
| **Database Query Layer** | **Kysely + node-postgres** | Type-safe SQL query builder without the heavy runtime reflection, hidden query generation, or migration issues of heavy ORMs (TypeORM/Prisma). Generates clean, zero-overhead, auditable SQL. |
| **Migrations** | **Version-Controlled Plain SQL** | Deterministic, immutable SQL migration files executed in CI/CD pipelines without black-box ORM schema diffing. |
| **Caching & Queues** | **Redis 7.x + BullMQ** | Sub-millisecond in-memory caching, distributed locks, rate limiting, and reliable background job queues. |
| **Event Streaming** | **Apache Kafka / Redpanda** | High-throughput distributed event streaming, partitioned topic ordering, consumer group scaling, and event replayability. Redpanda utilized for local development. |
| **Cloud Infrastructure** | **AWS ECS Fargate** | Serverless container execution without the operational complexity or cluster management overhead of Kubernetes. |
| **Infrastructure as Code** | **Terraform** | Declarative, reproducible cloud provisioning across development, staging, and production AWS accounts. |
| **Monorepo Tooling** | **pnpm workspaces + Turborepo** | Fast, disk-efficient package management with parallel execution, remote caching, and clear workspace dependency graphs. |
| **Testing Suite** | **Jest, Supertest, k6** | Unit, integration, and load testing. |

## 3. Technologies Explicitly Excluded

1. **MongoDB / Document Databases as Primary Transactional Store:**
   - Excluded because financial proposals, double-entry inventory movements, and customer consents require relational integrity, ACID transactions, and strict foreign references.
2. **Kubernetes (EKS) for Phase 1:**
   - Excluded to avoid premature operational complexity. ECS Fargate provides automated container scaling and native AWS IAM/Secrets integration with zero control plane maintenance.
3. **Prisma / TypeORM as Primary ORM:**
   - Excluded due to well-documented performance bottlenecks, memory consumption on large queries, and opaque query generation. Kysely provides 100% type safety with explicit, auditable SQL.

## 4. Consequences

### Positive
- Unified TypeScript language stack across all tiers (Full-Stack TypeScript).
- Fast onboarding: Developers can contribute across backend microservices, web, and mobile without context switching across languages.
- Predictable performance: Explicit Kysely SQL queries prevent the N+1 query problem and accidental table scans.
- Zero server management overhead with ECS Fargate.

### Negative / Trade-offs
- Node.js single-threaded event loop requires careful avoidance of synchronous CPU blocking operations (complex 3D solar irradiance math must be partitioned or offloaded to worker threads).
