# AETHRA — Microservice Bounded Contexts & Responsibility Matrix

> Phase 0 · Distributed Systems Architecture · v0.1.0

---

## 1. Overview & Service Decomposition Rationale

Microservice boundaries in AETHRA align strictly with Domain-Driven Design (DDD) bounded contexts. The decomposition avoids two common antipatterns:
1. **Entity Services / Table Services:** Services are not created for individual tables (e.g. there is no separate "Address Service" or "User Role Service").
2. **Distributed Monolith:** Services do not share database schemas or execute distributed 2-phase commit database transactions.

---

## 2. Service Responsibility Matrix

| # | Service Name | Bounded Context | Database Name | Primary Workload Profile |
|---|---|---|---|---|
| 01 | **API Gateway** | Edge Routing, Rate Limiting & Auth Validation | N/A (Stateless) | High Network I/O, Low Latency |
| 02 | **Web BFF** | Web App Aggregation & Server-Side Rendering | Redis Cache | Network I/O, High Concurrency |
| 03 | **Mobile BFF** | Android/iOS Payload Optimization & Sync | Redis Cache | Network I/O, Mobile Payload Compression |
| 04 | **Identity Service** | User Authentication Primitives & OIDC Bridge | `identity_db` | Medium Read, Low Write, High Security |
| 05 | **Organisation Service** | Vendor Tenancy, Branches & Membership | `organisation_db` | High Read (Cached), Low Write |
| 06 | **Access Control Service** | RBAC/ABAC Policy Engine & Scope Grants | `access_control_db` | Critical Read (In-Memory/Redis), Low Write |
| 07 | **Subscription Service** | SaaS Plans, Modules, Quotas & Metering | `subscription_db` | Medium Read, Atomic Quota Writes |
| 08 | **Customer Service** | Customer Accounts, Properties & Assets | `customer_db` | High Read, Medium Write |
| 09 | **Vendor Relationship Service** | Multi-Vendor Consent, Grants & Revocations | `vendor_relationship_db` | High Security, Event Trigger Hub |
| 10 | **CRM Service** | Pre-Sales Pipeline, Leads & Interactions | `crm_db` | Medium Read/Write, Burst Traffic |
| 11 | **Product Catalogue Service** | Global OEM Specs & Vendor Costing | `catalogue_db` | Very High Read (Edge Cached), Low Write |
| 12 | **Quotation Service** | Pricing Snapshots, Proposals & Acceptance | `quotation_db` | High Business Logic, Immutable Revisions |
| 13 | **Engineering Service** | Solar Simulation, Sizing & BOM Engine | `engineering_db` | High CPU Compute, Complex Math |
| 14 | **Inventory Service** | Append-Only Stock Ledgers & Warehousing | `inventory_db` | High Write Concurrency, Row Locks |
| 15 | **Procurement Service** | Suppliers, Requisitions & Purchase Orders | `procurement_db` | Low/Medium Transactional |
| 16 | **Project Service** | EPC Milestones, EPC Tasks & Handover | `project_db` | High Read, Medium Write |
| 17 | **Document Service** | S3 Private Storage & Presigned Sessions | `document_db` | High Storage I/O, Async Worker Processing |
| 18 | **Notification Service** | Multi-Channel Dispatch (SMS, Mail, Push) | `notification_db` | High Async I/O, Burst Worker Pool |
| 19 | **Service Management** | Maintenance Tickets, AMCs & Visits | `service_db` | Medium Read/Write, Mobile Field Sync |
| 20 | **Reporting Service** | Read Models, Analytics & Async Exports | `reporting_db` | High Read/Batch Compute, Low Txn |
| 21 | **Integration Service** | Third-Party Webhooks & IoT Connectors | `integration_db` | High Network I/O, Ingress Webhooks |
| 22 | **Audit Service** | Tamper-Resistant Immutable Audit Logs | `audit_db` | High Append-Only Write, Zero Update |
| 23 | **AI Service (Boundary)** | Future Model Routing & Quota Mediation | N/A (Stateless) | High Latency Compute, Streaming LLM |

---

## 3. Detailed Service Profiles

### 3.1 API Gateway
- **Business Responsibility:** Acts as the single external reverse proxy for all incoming public and mobile traffic. Manages TLS termination, path routing, distributed rate limiting, and initial JWT token validation.
- **Owned Entities:** None (Stateless).
- **Dependencies:** Web BFF, Mobile BFF, Identity Service (JWKS endpoint).
- **Dependents:** Web, Android, and iOS clients.
- **Scaling:** Scales horizontally based on network socket count and requests per second (RPS).

### 3.2 Web BFF & Mobile BFF
- **Business Responsibility:** Aggregates and transforms backend microservice responses specifically tailored for desktop web dashboards (Web BFF) or bandwidth-constrained mobile apps (Mobile BFF).
- **Owned Entities:** Redis session and response cache keys.
- **Dependencies:** Downstream microservices via REST/gRPC.
- **Dependents:** API Gateway.
- **Scaling:** High concurrency, CPU-light, network-bound.

### 3.3 Identity Service
- **Business Responsibility:** Manages core user identity records, authentication provider mappings (AWS Cognito, Google, Microsoft OIDC), and password/OTP verification workflows.
- **Owned Entities:** `users`, `user_auth_providers`, `email_verifications`, `phone_verifications`, `account_recovery`, `user_sessions`.
- **Dependencies:** AWS Cognito / OIDC Provider, Notification Service (OTP delivery).
- **Dependents:** API Gateway, Organisation Service, Customer Service.
- **Events Produced:** `identity.user.registered.v1`, `identity.user.authenticated.v1`, `identity.user.deactivated.v1`.
- **Scaling:** Read-heavy during authentication spikes (morning shifts).

### 3.4 Organisation & Tenant Service
- **Business Responsibility:** Manages vendor tenant profiles, business categories, branch locations, warehouse masters, employee invitations, and user-to-tenant memberships.
- **Owned Entities:** `organisations`, `organisation_profiles`, `business_categories`, `branches`, `warehouses`, `organisation_configurations`, `organisation_memberships`, `membership_invitations`.
- **Dependencies:** Identity Service, Access Control Service.
- **Dependents:** All tenant-scoped services.
- **Events Produced:** `organisation.created.v1`, `organisation.membership.created.v1`, `organisation.membership.revoked.v1`.
- **Scaling:** Low write volume; high read volume heavily cached in Redis.

### 3.5 Access Control Service
- **Business Responsibility:** Central policy authority for role definitions, permission taxonomies, RBAC/ABAC evaluation, and temporary privileged access grants.
- **Owned Entities:** `roles`, `permissions`, `role_permissions`, `membership_roles`, `access_scopes`, `resource_assignments`, `policy_cache_metadata`, `temporary_access_grants`.
- **Dependencies:** Organisation Service, Identity Service.
- **Dependents:** All services evaluating permissions.
- **Events Produced:** `access_control.policy.updated.v1`, `access_control.policy.invalidated.v1`.
- **Scaling:** Critical path for authorization. Decoupled from service query paths via JWT claims and Redis policy caches.

### 3.6 Subscription & Entitlement Service
- **Business Responsibility:** Owns commercial subscription tiers, module catalogs, organization subscriptions, usage metering, and quota enforcement.
- **Owned Entities:** `subscription_plans`, `plan_modules`, `plan_features`, `module_catalogue`, `feature_catalogue`, `organisation_subscriptions`, `subscription_modules`, `entitlement_limits`, `usage_records`, `subscription_events`.
- **Dependencies:** Integration Service (Razorpay/Stripe billing webhooks).
- **Dependents:** All tenant-facing business services.
- **Events Produced:** `subscription.activated.v1`, `subscription.suspended.v1`, `subscription.limit_reached.v1`.
- **Scaling:** Atomic increment operations on entitlement counters.

### 3.7 Customer Service
- **Business Responsibility:** Maintains independent customer accounts, profiles, physical properties, installations (rooftop solar, BESS), and installed equipment asset registers.
- **Owned Entities:** `customer_accounts`, `customer_profiles`, `customer_contacts`, `customer_users`, `customer_properties`, `property_installations`, `property_assets`, `property_access_delegations`.
- **Dependencies:** Identity Service, Document Service.
- **Dependents:** Vendor Relationship, CRM, Quotation, Project, Service Management.
- **Events Produced:** `customer.created.v1`, `customer.property.added.v1`, `customer.installation.updated.v1`.
- **Scaling:** Scaled for high read queries from customer mobile portals.

### 3.8 Vendor Relationship Service
- **Business Responsibility:** Controls multi-tenant access grants and customer consent between vendor organizations and customer properties. Enables customer multi-vendor participation without data leakage.
- **Owned Entities:** `vendor_customer_relationships`, `relationship_invitations`, `customer_consents`, `relationship_purposes`, `vendor_access_grants`, `property_access_grants`, `installation_access_grants`, `access_revocation_history`.
- **Dependencies:** Organisation Service, Customer Service, Identity Service.
- **Dependents:** CRM, Quotation, Project, Service Management.
- **Events Produced:** `vendor_relationship.created.v1`, `vendor_relationship.activated.v1`, `vendor_relationship.revoked.v1`.
- **Scaling:** Security-critical, moderate write volume, real-time event broadcasting on revocation.

### 3.9 CRM Service
- **Business Responsibility:** Manages vendor pre-sales pipelines, inquiries, lead stages, rep assignments, and conversion workflows.
- **Owned Entities:** `leads`, `lead_sources`, `lead_stages`, `lead_assignments`, `lead_activities`, `lead_follow_ups`, `lead_interactions`, `lead_conversions`.
- **Dependencies:** Identity Service, Organisation Service, Customer Service.
- **Dependents:** Quotation Service, Reporting Service.
- **Events Produced:** `crm.lead.created.v1`, `crm.lead.assigned.v1`, `crm.lead.converted.v1`.
- **Scaling:** Bursty pre-sales campaign ingestion.

### 3.10 Product Catalogue Service
- **Business Responsibility:** Manages global renewable energy equipment specifications (panels, inverters, batteries) and vendor-private procurement/selling price structures.
- **Owned Entities:** `product_categories`, `brands`, `units`, `product_models`, `product_specifications`, `specification_values`, `product_documents`, `warranty_templates`, `vendor_catalogue_entries`.
- **Dependencies:** Document Service.
- **Dependents:** Quotation, Engineering, Inventory, Procurement, Customer Asset Register.
- **Events Produced:** `catalogue.model.created.v1`, `catalogue.price.updated.v1`.
- **Scaling:** High read ratio (>98% reads). Highly cacheable at CDN and Redis layers.

### 3.11 Quotation Service
- **Business Responsibility:** Manages commercial proposals, price calculations, itemized BOM pricing, immutable revision snapshots, and customer digital acceptance.
- **Owned Entities:** `quotations`, `quotation_revisions`, `quotation_lines`, `pricing_snapshots`, `quotation_discounts`, `quotation_taxes`, `payment_terms`, `quotation_documents`, `customer_responses`.
- **Dependencies:** Catalogue, Engineering, Customer, Vendor Relationship, Document Service.
- **Dependents:** Project Service, Reporting Service.
- **Events Produced:** `quotation.issued.v1`, `quotation.accepted.v1`, `quotation.rejected.v1`.
- **Scaling:** Moderate volume, strict transactional consistency on revisions and snapshots.

### 3.12 Engineering & Estimation Service
- **Business Responsibility:** Sizing calculations for solar capacity, irradiance, tilt/orientation, generation forecasts, and Bill of Materials generation.
- **Owned Entities:** `calculation_profiles`, `calculation_profile_versions`, `engineering_inputs`, `engineering_estimates`, `calculation_outputs`, `calculation_assumptions`, `bill_of_materials`, `bom_versions`, `bom_items`, `engineering_disclaimers`.
- **Dependencies:** Catalogue Service.
- **Dependents:** Quotation Service.
- **Events Produced:** `engineering.estimate.completed.v1`, `engineering.bom.generated.v1`.
- **Scaling:** Compute/CPU-bound. Sized with larger ECS CPU allocations.

### 3.13 Inventory Service
- **Business Responsibility:** Multi-warehouse stock ledger, moving average cost tracking, stock reservations for projects, receipts, issues, and serial number tracking.
- **Owned Entities:** `warehouses`, `stock_balances`, `stock_ledger_entries`, `stock_reservations`, `stock_transfers`, `stock_receipts`, `stock_issues`, `stock_returns`, `stock_adjustments`, `batch_numbers`, `serial_numbers`, `project_allocations`.
- **Dependencies:** Organisation Service, Catalogue Service.
- **Dependents:** Procurement Service, Project Service, Service Management.
- **Events Produced:** `inventory.stock.received.v1`, `inventory.stock.reserved.v1`, `inventory.stock.issued.v1`.
- **Scaling:** High concurrency on balance row locks. Append-only ledger scaling.

### 3.14 Procurement Service
- **Business Responsibility:** Supplier directory, purchase requisitions, supplier POs, and goods receipt inspections.
- **Owned Entities:** `suppliers`, `purchase_requisitions`, `purchase_requisition_lines`, `purchase_orders`, `purchase_order_lines`, `goods_receipts`, `goods_receipt_lines`, `supplier_invoice_references`.
- **Dependencies:** Catalogue Service, Inventory Service.
- **Dependents:** Inventory Service, Reporting Service.
- **Events Produced:** `procurement.po.issued.v1`, `procurement.goods_receipt.confirmed.v1`.
- **Scaling:** Low-to-medium transactional workload.

### 3.15 Project Management Service
- **Business Responsibility:** EPC solar construction milestones, engineering tasks, subcontractor assignments, discom net-metering approvals, and handover documentation.
- **Owned Entities:** `projects`, `project_sites`, `milestones`, `tasks`, `task_dependencies`, `task_assignments`, `project_events`, `handover_records`, `customer_progress_views`.
- **Dependencies:** Quotation Service, Customer Service, Document Service, Inventory Service.
- **Dependents:** Service Management, Reporting Service.
- **Events Produced:** `project.created.v1`, `project.milestone.published.v1`, `project.handover.completed.v1`.
- **Scaling:** Balanced read/write workload. High mobile technician interactions.

### 3.16 Document & File Service
- **Business Responsibility:** Presigned S3 upload sessions, malware scan validation, metadata indexing, and authorized download link generation.
- **Owned Entities:** `files`, `upload_sessions`, `file_access_policies`, `file_classifications`, `file_processing_state`, `retention_policies`.
- **Dependencies:** AWS S3, ClamAV / AWS GuardDuty.
- **Dependents:** All services requiring binary file attachments.
- **Events Produced:** `document.upload.completed.v1`, `document.scan.clean.v1`.
- **Scaling:** Scaled for high concurrent presigned token generation and async scanning.

### 3.17 Notification Service
- **Business Responsibility:** Template rendering and multi-channel message dispatch across Email (SES), SMS (Kaleyra), WhatsApp (Gupshup/Meta), and Mobile Push (Firebase FCM).
- **Owned Entities:** `notification_preferences`, `notification_templates`, `notification_deliveries`, `delivery_attempts`, `in_app_notifications`.
- **Dependencies:** Third-party gateway providers (SES, Kaleyra, Gupshup, FCM).
- **Dependents:** All services requiring user alerts.
- **Events Consumed:** Consumes all major platform domain events via Kafka.
- **Scaling:** Scaled horizontally with BullMQ worker pools to absorb traffic spikes without stalling core flows.

### 3.18 Service Management Service
- **Business Responsibility:** Solar plant post-handover O&M: customer tickets, AMC contracts, preventive maintenance visits, technician dispatch, and warranty spare replacements.
- **Owned Entities:** `amc_contracts`, `service_tickets`, `ticket_events`, `service_assignments`, `service_visits`, `parts_used`.
- **Dependencies:** Customer Service, Inventory Service, Document Service.
- **Dependents:** Reporting Service.
- **Events Produced:** `service.ticket.created.v1`, `service.ticket.resolved.v1`.
- **Scaling:** Read/write field service technician workload.

### 3.19 Reporting & Analytics Service
- **Business Responsibility:** Event-driven read models, operational rollups, and asynchronous tabular data exports.
- **Owned Entities:** `report_definitions`, `report_projections`, `export_jobs`, `analytics_aggregations`.
- **Dependencies:** Consumes Kafka events from all operational domains.
- **Dependents:** Web BFF.
- **Events Produced:** `reporting.export.completed.v1`.
- **Scaling:** High compute/read workload. Read-replica attached.

### 3.20 Integration Service
- **Business Responsibility:** Manages third-party payment webhooks (Razorpay/Cashfree) and solar inverter IoT telemetry ingestion (Growatt, Solis, Sungrow).
- **Owned Entities:** `integration_providers`, `integration_connections`, `webhook_endpoints`, `webhook_deliveries`, `integration_logs`, `sync_status`.
- **Dependencies:** Inverter cloud APIs, Payment Gateways.
- **Dependents:** Subscription, Quotation, Customer Asset Register.
- **Events Produced:** `integration.payment.captured.v1`, `integration.inverter.telemetry_received.v1`.
- **Scaling:** High ingress throughput for IoT inverter telemetry.

### 3.21 Audit Service
- **Business Responsibility:** Append-only security audit journal indexing all sensitive user actions, privilege changes, and financial modifications across the platform.
- **Owned Entities:** `audit_events`.
- **Dependencies:** Consumes `*.audit.*` and high-severity domain events from Kafka.
- **Dependents:** Compliance and security reporting.
- **Events Produced:** None (sink service).
- **Scaling:** High-volume sequential insert workload; optimized with timescale partitioning or partitioned PostgreSQL tables.

### 3.22 AI Gateway / AI Service (Boundary)
- **Business Responsibility:** Future model routing, prompt template versioning, LLM provider abstraction, token quotas, and semantic retrieval over authorized document embeddings.
- **Owned Entities:** Stateless boundary initially.
- **Dependencies:** LLM providers (Anthropic, Gemini, OpenAI via Bedrock/Vertex), Vector Store (`pgvector` in dedicated retrieval database).
- **Dependents:** Web BFF, Mobile BFF.
- **Scaling:** High-latency streaming compute.
