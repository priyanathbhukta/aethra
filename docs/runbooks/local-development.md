# AETHRA — Local Development Runbook

> Phase 0 · Developer Operations · v0.1.0

---

## 1. Prerequisites

Ensure your local development machine has the following tools installed:

| Tool | Minimum Version | Installation / Verification Command |
|---|---|---|
| **Node.js** | `v20.x LTS` | `node -v` |
| **pnpm** | `v9.x` | `corepack enable && pnpm -v` |
| **Docker Desktop / Colima** | `v24.x` | `docker --version && docker compose version` |
| **Git** | `v2.40+` | `git --version` |

---

## 2. Monorepo Structure

```text
aethra/
├── apps/
│   ├── api-gateway/          # Edge reverse proxy & rate limiter
│   ├── web-bff/              # Next.js web aggregation layer
│   ├── mobile-bff/           # React Native / mobile aggregation layer
│   ├── web/                  # Next.js 14 Web Application
│   └── mobile/               # React Native / Expo Mobile Application
├── services/
│   ├── identity-service/
│   ├── organisation-service/
│   ├── access-control-service/
│   ├── subscription-service/
│   ├── customer-service/
│   ├── vendor-relationship-service/
│   ├── crm-service/
│   ├── catalogue-service/
│   ├── quotation-service/
│   ├── engineering-service/
│   ├── inventory-service/
│   ├── procurement-service/
│   ├── project-service/
│   ├── document-service/
│   ├── notification-service/
│   ├── service-management-service/
│   ├── reporting-service/
│   ├── integration-service/
│   ├── audit-service/
│   └── ai-service/
├── packages/
│   ├── api-contracts/        # Generated OpenAPI models & validation
│   ├── event-contracts/      # Avro / JSON schemas for Kafka events
│   ├── shared-types/         # Domain enums & shared DTOs
│   ├── config/               # Environment & configuration loader
│   ├── observability/        # Pino logging & OpenTelemetry setup
│   └── testing/              # Test harnesses, mocks & DB fixtures
├── infrastructure/
│   ├── docker/               # Local Dockerfiles & init scripts
│   └── terraform/            # Cloud infrastructure definitions
├── docker-compose.yml        # Local infrastructure orchestration
├── pnpm-workspace.yaml       # Monorepo workspace configuration
├── turbo.json                # Turborepo task pipeline definition
└── package.json              # Monorepo root manifest
```

---

## 3. Local Infrastructure Setup (Docker Compose)

Start the local backing services (PostgreSQL 16, Redis, Redpanda Kafka, and Redpanda Console):

```bash
# 1. Start all infrastructure containers in the background
docker compose up -d

# 2. Verify container health status
docker compose ps
```

### Local Services & Ports

| Service | Port | Description / Web UI | Credentials |
|---|---|---|---|
| **PostgreSQL 16** | `5432` | 19 logical databases pre-created | User: `postgres`, Password: `postgrespassword` |
| **Redis 7.x** | `6379` | In-memory cache & queues | No password (local dev) |
| **Redpanda Kafka** | `9092` | Kafka-compatible broker (Zero JVM) | Internal: `redpanda:9092`, External: `localhost:9092` |
| **Redpanda Console**| `8080` | Web UI for topics, consumers & messages | Access via browser: `http://localhost:8080` |
| **MinIO (S3 Mock)** | `9000` / `9001`| S3-compatible private object storage | Web Console: `http://localhost:9001` (minioadmin/minioadmin) |

---

## 4. Initial Repository Installation & Environment Setup

```bash
# 1. Clone repository & install all workspace dependencies
git clone https://github.com/aethra-energy/aethra.git
cd aethra
pnpm install

# 2. Copy root and service environment templates
cp .env.example .env

# 3. Build shared packages (contracts, types, config)
pnpm turbo run build --filter="./packages/*"
```

---

## 5. Running Database Migrations Locally

Each service manages its own migrations via SQL files executed through Kysely / node-pg:

```bash
# Run migrations across all services
pnpm turbo run db:migrate

# Run migrations for a specific service (e.g. quotation-service)
pnpm --filter quotation-service db:migrate

# Seed development fixture data
pnpm turbo run db:seed
```

---

## 6. Running Services Locally

You can run individual services or target specific domains using Turborepo:

```bash
# Run all core platform services in parallel watch mode
pnpm turbo run dev --filter="./services/identity-service" \
                   --filter="./services/organisation-service" \
                   --filter="./services/access-control-service" \
                   --filter="./services/subscription-service"

# Run a single service with hot reload
pnpm --filter quotation-service dev

# Run the API Gateway
pnpm --filter api-gateway dev
```

---

## 7. Automated Testing Standards

```bash
# Run all unit tests with Turborepo caching
pnpm turbo run test

# Run integration tests against local Docker PostgreSQL
pnpm turbo run test:integration

# Run linting and typecheck across the entire monorepo
pnpm turbo run lint
pnpm turbo run typecheck
```

---

## 8. Service Health Probes

Every service exposes standardized health endpoints for local verification:
```bash
# Liveness probe (checks process responsiveness)
curl -i http://localhost:3001/health/live

# Readiness probe (verifies PostgreSQL, Redis, and Kafka connectivity)
curl -i http://localhost:3001/health/ready
```
Expected response:
```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" },
    "kafka": { "status": "up" }
  }
}
```
