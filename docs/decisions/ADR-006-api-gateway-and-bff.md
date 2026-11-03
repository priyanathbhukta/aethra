# ADR-006: API Gateway and Dedicated Web & Mobile BFFs

> Status: **Accepted**  
> Date: 2026-11-03  
> Deciders: Mobile/Web Platform Architect, Distributed Systems Architect  

---

## 1. Context

The AETHRA platform serves three distinct client form factors with drastically different usage characteristics:
1. **Desktop Web Users (Vendor Admins, Engineers, Accountants):**
   - High-bandwidth broadband connections.
   - Large viewports requiring complex composite screens (e.g. EPC executive dashboards showing CRM funnels, real-time stock levels, quotation conversion metrics, and project Gantt charts simultaneously).
2. **Mobile Users (Field Engineers, Technicians, Sales Reps, Customers):**
   - Cellular connections (4G/5G/rural 3G) with intermittent connectivity.
   - Small viewports requiring lightweight cards, infinite feeds, compressed thumbnail assets, and minimal battery/data consumption.

Directly exposing 20+ fine-grained internal microservices to client applications would result in:
- High client-side round-trip chatty latency.
- Tight coupling between client UI versions and internal microservice endpoints.
- Inefficient mobile network usage and battery drain.

## 2. Decision

We adopt a **Two-Tier Ingress Architecture** comprising an **Edge API Gateway** and **Dedicated Backend-for-Frontend (BFF)** layers:

1. **Edge API Gateway (AWS API Gateway / ALB):**
   - Single public entry point (`https://api.aethra.energy`).
   - Handles global TLS termination, DDoS mitigation (AWS WAF), global rate limiting, and route forwarding.
   - Routes `/api/v1/web/*` to the **Web BFF** and `/api/v1/mobile/*` to the **Mobile BFF**.
   - Contains **zero core business domain logic**.
2. **Web BFF (`apps/web-bff`):**
   - Optimized for desktop web applications.
   - Executes parallel internal RPC/REST calls to aggregate multi-service dashboard screens in a single round-trip.
   - Returns rich, nested response models with full desktop tabular data.
3. **Mobile BFF (`apps/mobile-bff`):**
   - Optimized for Android and iOS React Native/Expo clients.
   - Filters out non-essential desktop metadata to minimize payload sizes (targeting <15KB per feed item).
   - Coordinates mobile thumbnail image generation.
   - Exposes a dedicated batch synchronization endpoint (`/sync/batch`) for offline field technician mutation reconciliation.

## 3. Consequences

### Positive
- **Client Autonomy:** Web and mobile development teams can evolve their client-specific aggregation contracts independently without modifying core backend microservices.
- **Superior Mobile User Experience:** Faster initial page loads, lower cellular data consumption, and responsive performance even on lower-tier mobile hardware.
- **Security Boundary:** Internal service architectures and microservice topologies are completely hidden behind the BFF layer.

### Negative / Trade-offs
- An additional network hop between the client and internal microservices (mitigated by deploying BFFs and microservices in the same low-latency AWS VPC private subnets).
- Requires maintaining two separate BFF codebases (shared TypeScript types and utility packages in the monorepo minimize code duplication).

## 4. Alternatives Considered

- **Single Unified Gateway for All Clients:** Rejected because web desktop requirements (dense, multi-entity tabular grids) directly conflict with mobile bandwidth, memory, and battery optimization goals.
- **Direct Client-to-Microservice Communication:** Rejected due to chatty network latency, security exposure of internal endpoints, and difficulty maintaining backward compatibility during mobile app version lifecycles.
