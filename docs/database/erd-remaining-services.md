# AETHRA — Supporting Services ERD

> Phase 0 · Databases: `document_db`, `notification_db`, `service_db`, `reporting_db`, `integration_db`, `audit_db` · v0.1.0

---

## 1. Document & File Service (`document_db`)

### 1.1 Overview
The Document & File Service manages private S3 object storage references, pre-signed upload sessions, malware scanning states, access authorization, and document retention.
- **Rule:** Permanent public S3 URLs are strictly prohibited. Files are accessed via time-limited, signed HMAC URLs generated only after authorization evaluation.

### 1.2 ERD
```mermaid
erDiagram
    files ||--o{ upload_sessions : "uploaded via"
    files ||--o{ file_access_policies : "governed by"
    files ||--o{ file_processing_state : "status"
    file_classifications ||--o{ files : "classified as"
    retention_policies ||--o{ files : "retains"

    file_classifications {
        uuid id PK "gen_random_uuid()"
        text code "NOT NULL, UNIQUE — quotation_proposal|site_photo|discom_letter|commissioning_cert|supplier_invoice"
        text name "NOT NULL"
        text sensitivity_level "NOT NULL DEFAULT 'confidential' — public|internal|confidential|restricted"
        boolean requires_malware_scan "NOT NULL DEFAULT true"
    }

    files {
        uuid id PK "gen_random_uuid()"
        uuid organisation_id "nullable — vendor tenant ID; NULL for global public assets"
        uuid classification_id FK "NOT NULL → file_classifications.id"
        text file_name "NOT NULL"
        text s3_bucket "NOT NULL"
        text s3_key "NOT NULL, UNIQUE"
        text content_type "NOT NULL — e.g. 'application/pdf', 'image/jpeg'"
        bigint file_size_bytes "NOT NULL"
        text sha256_hash "NOT NULL"
        uuid uploaded_by_user_id "NOT NULL — external Identity user ID"
        timestamptz created_at "NOT NULL DEFAULT now()"
    }

    upload_sessions {
        uuid id PK "gen_random_uuid()"
        uuid organisation_id "nullable"
        text session_token "NOT NULL, UNIQUE"
        text target_s3_key "NOT NULL"
        text expected_content_type "NOT NULL"
        bigint max_bytes "NOT NULL"
        timestamptz expires_at "NOT NULL"
        text status "NOT NULL DEFAULT 'pending' — pending|completed|expired|aborted"
        timestamptz created_at "NOT NULL DEFAULT now()"
    }

    file_access_policies {
        uuid id PK "gen_random_uuid()"
        uuid file_id FK "NOT NULL → files.id"
        text entity_type "NOT NULL — quotation|project|ticket|lead|catalogue"
        uuid entity_id "NOT NULL — target entity UUID"
        text permission_required "NOT NULL — e.g. 'quotation.read', 'project.read'"
        boolean allow_customer_access "NOT NULL DEFAULT false"
        timestamptz created_at "NOT NULL DEFAULT now()"
    }

    file_processing_state {
        uuid id PK "gen_random_uuid()"
        uuid file_id FK "NOT NULL, UNIQUE → files.id"
        text scan_status "NOT NULL DEFAULT 'pending' — pending|clean|infected|failed"
        text scan_engine "nullable"
        timestamptz scanned_at "nullable"
        text thumbnail_s3_key "nullable"
    }

    retention_policies {
        uuid id PK "gen_random_uuid()"
        uuid classification_id FK "NOT NULL → file_classifications.id"
        int retention_days "NOT NULL DEFAULT 2555 — 7 years for tax/statutory files"
        text action_on_expiry "NOT NULL DEFAULT 'archive' — archive|delete|flag"
    }
```

---

## 2. Notification Service (`notification_db`)

### 2.1 Overview
The Notification Service handles multi-channel delivery (Email, SMS, WhatsApp, Web Push, and Mobile In-App) via resilient provider adapters. Provider outages never compromise transactional business operations.

### 2.2 ERD
```mermaid
erDiagram
    notification_templates ||--o{ notification_deliveries : "instantiates"
    notification_deliveries ||--o{ delivery_attempts : "tracks tries"

    notification_preferences {
        uuid id PK "gen_random_uuid()"
        uuid user_id "NOT NULL — external Identity user ID"
        text channel "NOT NULL — email|sms|whatsapp|push"
        text category "NOT NULL — project_update|quote_received|service_ticket|promotional"
        boolean is_enabled "NOT NULL DEFAULT true"
        timestamptz updated_at "NOT NULL DEFAULT now()"
    }

    notification_templates {
        uuid id PK "gen_random_uuid()"
        text template_code "NOT NULL, UNIQUE — e.g. 'quote_issued_v1', 'otp_login_v1'"
        text channel "NOT NULL — email|sms|whatsapp|push"
        text subject_template "nullable"
        text body_template "NOT NULL"
        jsonb required_variables "NOT NULL — schema of required payload parameters"
        boolean is_active "NOT NULL DEFAULT true"
        timestamptz updated_at "NOT NULL DEFAULT now()"
    }

    notification_deliveries {
        uuid id PK "gen_random_uuid()"
        uuid organisation_id "nullable — vendor tenant context"
        uuid template_id FK "NOT NULL → notification_templates.id"
        uuid recipient_user_id "nullable — external Identity user ID"
        text destination "NOT NULL — email address, phone number, push device token"
        text channel "NOT NULL — email|sms|whatsapp|push"
        jsonb template_data "NOT NULL"
        text status "NOT NULL DEFAULT 'queued' — queued|sent|delivered|failed"
        int retry_count "NOT NULL DEFAULT 0"
        timestamptz created_at "NOT NULL DEFAULT now()"
        timestamptz sent_at "nullable"
    }

    delivery_attempts {
        uuid id PK "gen_random_uuid()"
        uuid delivery_id FK "NOT NULL → notification_deliveries.id"
        text provider_name "NOT NULL — aws_ses|twilio|kaleyra|gupshup|firebase_fcm"
        text provider_message_id "nullable"
        text status "NOT NULL — success|retryable_failure|terminal_failure"
        text error_response "nullable"
        timestamptz attempted_at "NOT NULL DEFAULT now()"
    }

    in_app_notifications {
        uuid id PK "gen_random_uuid()"
        uuid recipient_user_id "NOT NULL — external Identity user ID"
        uuid organisation_id "nullable — vendor tenant context"
        text title "NOT NULL"
        text body "NOT NULL"
        text link_action "nullable — deep link to web/mobile screen"
        boolean is_read "NOT NULL DEFAULT false"
        timestamptz read_at "nullable"
        timestamptz created_at "NOT NULL DEFAULT now()"
    }
```

---

## 3. Service Management Service (`service_db`)

### 3.1 Overview
The Service Management Service handles post-commissioning operations: customer support tickets, maintenance requests, annual maintenance contracts (AMC), technician on-site visits, and warranty spare parts replacement.

### 3.2 ERD
```mermaid
erDiagram
    amc_contracts ||--o{ service_tickets : "covered by"
    service_tickets ||--o{ ticket_events : "history"
    service_tickets ||--o{ service_assignments : "dispatched"
    service_assignments ||--o{ service_visits : "executed"
    service_visits ||--o{ parts_used : "replaces"

    amc_contracts {
        uuid id PK "gen_random_uuid()"
        uuid organisation_id "NOT NULL — vendor tenant ID"
        text amc_code "NOT NULL — e.g. 'AMC-2026-0019'"
        uuid customer_id "NOT NULL — external Customer Service customer_accounts.id"
        uuid property_id "NOT NULL — external Customer Service customer_properties.id"
        uuid installation_id "NOT NULL — external Customer Service property_installations.id"
        text contract_tier "NOT NULL — comprehensive|non_comprehensive|preventive_only"
        int visits_per_year "NOT NULL DEFAULT 4"
        numeric contract_amount "NOT NULL"
        date start_date "NOT NULL"
        date end_date "NOT NULL"
        text status "NOT NULL DEFAULT 'active' — active|expired|cancelled"
        timestamptz created_at "NOT NULL DEFAULT now()"
    }

    service_tickets {
        uuid id PK "gen_random_uuid()"
        uuid organisation_id "NOT NULL — vendor tenant ID"
        text ticket_number "NOT NULL — e.g. 'TKT-2026-0155'"
        uuid customer_id "NOT NULL — external Customer Service customer_accounts.id"
        uuid property_id "NOT NULL — external Customer Service customer_properties.id"
        uuid installation_id "nullable — external Customer Service property_installations.id"
        uuid amc_id FK "nullable → amc_contracts.id"
        text ticket_type "NOT NULL — inverter_failure|panel_damage|generation_drop|grid_tripping|routine_check"
        text priority "NOT NULL DEFAULT 'medium' — low|medium|high|critical"
        text status "NOT NULL DEFAULT 'open' — open|assigned|in_progress|pending_parts|resolved|closed"
        text customer_reported_issue "NOT NULL"
        uuid created_by_user_id "NOT NULL — Identity user ID"
        timestamptz resolved_at "nullable"
        timestamptz created_at "NOT NULL DEFAULT now()"
        timestamptz updated_at "NOT NULL DEFAULT now()"
    }

    ticket_events {
        uuid id PK "gen_random_uuid()"
        uuid ticket_id FK "NOT NULL → service_tickets.id"
        uuid organisation_id "NOT NULL — vendor tenant ID"
        text event_type "NOT NULL — status_change|comment_added|parts_requested"
        text summary "NOT NULL"
        boolean is_customer_visible "NOT NULL DEFAULT true"
        uuid actor_user_id "NOT NULL"
        timestamptz created_at "NOT NULL DEFAULT now()"
    }

    service_assignments {
        uuid id PK "gen_random_uuid()"
        uuid ticket_id FK "NOT NULL → service_tickets.id"
        uuid technician_user_id "NOT NULL — external Identity user ID"
        timestamptz scheduled_at "NOT NULL"
        text status "NOT NULL DEFAULT 'scheduled' — scheduled|en_route|on_site|completed|rescheduled"
        timestamptz assigned_at "NOT NULL DEFAULT now()"
    }

    service_visits {
        uuid id PK "gen_random_uuid()"
        uuid assignment_id FK "NOT NULL → service_assignments.id"
        uuid ticket_id FK "NOT NULL → service_tickets.id"
        timestamptz arrival_time "NOT NULL"
        timestamptz departure_time "nullable"
        text site_observations "NOT NULL"
        text root_cause "nullable"
        text corrective_action "NOT NULL"
        text customer_signoff_name "nullable"
        text customer_signature_doc_id "nullable — external Document Service ID"
        timestamptz signed_at "nullable"
    }

    parts_used {
        uuid id PK "gen_random_uuid()"
        uuid visit_id FK "NOT NULL → service_visits.id"
        uuid organisation_id "NOT NULL — vendor tenant ID"
        uuid catalogue_product_id "NOT NULL — external Catalogue Service product_models.id"
        text item_name "NOT NULL"
        numeric quantity "NOT NULL DEFAULT 1"
        text serial_number_removed "nullable"
        text serial_number_installed "nullable"
        text warranty_status "NOT NULL DEFAULT 'covered_under_warranty' — covered_under_warranty|chargeable|amc_covered"
        numeric billed_amount "NOT NULL DEFAULT 0.00"
    }
```

---

## 4. Reporting & Analytics Service (`reporting_db`)

### 4.1 Overview
The Reporting & Analytics Service maintains aggregated read models, periodic performance rollups, and asynchronous data export jobs (CSV, XLSX, PDF). It guarantees that heavy analytical queries never impact transactional operational databases.

### 4.2 ERD
```mermaid
erDiagram
    report_definitions ||--o{ export_jobs : "generates"

    report_definitions {
        uuid id PK "gen_random_uuid()"
        text report_code "NOT NULL, UNIQUE — e.g. 'sales_conversion_funnel', 'inventory_valuation', 'project_sla_delays'"
        text name "NOT NULL"
        text category "NOT NULL — sales|operations|inventory|financial|service"
        jsonb parameters_schema "NOT NULL — expected filter parameters"
        boolean is_active "NOT NULL DEFAULT true"
        timestamptz created_at "NOT NULL DEFAULT now()"
    }

    report_projections {
        uuid id PK "gen_random_uuid()"
        uuid organisation_id "NOT NULL — vendor tenant ID"
        text projection_type "NOT NULL — monthly_sales|quarterly_installations|warranty_claims"
        date period_start "NOT NULL"
        date period_end "NOT NULL"
        jsonb aggregated_metrics "NOT NULL — precomputed totals, counts, margins"
        timestamptz last_updated_at "NOT NULL DEFAULT now()"
    }

    export_jobs {
        uuid id PK "gen_random_uuid()"
        uuid organisation_id "NOT NULL — vendor tenant ID"
        uuid report_id FK "NOT NULL → report_definitions.id"
        uuid requested_by_user_id "NOT NULL — external Identity user ID"
        jsonb filter_parameters "NOT NULL"
        text export_format "NOT NULL DEFAULT 'csv' — csv|xlsx|pdf"
        text status "NOT NULL DEFAULT 'queued' — queued|processing|completed|failed"
        text download_file_id "nullable — external Document Service files.id"
        timestamptz expires_at "nullable"
        timestamptz created_at "NOT NULL DEFAULT now()"
        timestamptz completed_at "nullable"
    }

    analytics_aggregations {
        uuid id PK "gen_random_uuid()"
        uuid organisation_id "NOT NULL — vendor tenant ID"
        text metric_name "NOT NULL — e.g. 'kwp_installed_total', 'average_quote_turnaround_hours'"
        numeric metric_value "NOT NULL"
        date snapshot_date "NOT NULL"
        timestamptz computed_at "NOT NULL DEFAULT now()"
    }
```

---

## 5. Integration Service (`integration_db`)

### 5.1 Overview
The Integration Service orchestrates webhooks, provider credentials, and sync jobs for third-party systems (Payment Gateways, Inverter IoT Clouds, WhatsApp Business BSPs, and ERP connectors).

### 5.2 ERD
```mermaid
erDiagram
    integration_providers ||--o{ integration_connections : "implements"
    integration_connections ||--o{ webhook_endpoints : "receives on"
    webhook_endpoints ||--o{ webhook_deliveries : "logs"
    integration_connections ||--o{ integration_logs : "audits calls"
    integration_connections ||--o{ sync_status : "tracks sync state"

    integration_providers {
        uuid id PK "gen_random_uuid()"
        text provider_code "NOT NULL, UNIQUE — razorpay|cashfree|growatt_shine|solis_cloud|whatsapp_meta"
        text name "NOT NULL"
        text provider_type "NOT NULL — payment_gateway|inverter_telemetry|messaging|gis"
        boolean is_active "NOT NULL DEFAULT true"
    }

    integration_connections {
        uuid id PK "gen_random_uuid()"
        uuid organisation_id "NOT NULL — vendor tenant ID"
        uuid provider_id FK "NOT NULL → integration_providers.id"
        text connection_name "NOT NULL"
        text encrypted_credentials_ref "NOT NULL — pointer to AWS Secrets Manager key"
        text status "NOT NULL DEFAULT 'active' — active|error|disconnected"
        timestamptz last_healthy_at "nullable"
        timestamptz created_at "NOT NULL DEFAULT now()"
        timestamptz updated_at "NOT NULL DEFAULT now()"
    }

    webhook_endpoints {
        uuid id PK "gen_random_uuid()"
        uuid connection_id FK "NOT NULL → integration_connections.id"
        text endpoint_path "NOT NULL, UNIQUE"
        text signing_secret_ref "NOT NULL — AWS Secrets Manager ref"
        boolean is_active "NOT NULL DEFAULT true"
        timestamptz created_at "NOT NULL DEFAULT now()"
    }

    webhook_deliveries {
        uuid id PK "gen_random_uuid()"
        uuid endpoint_id FK "NOT NULL → webhook_endpoints.id"
        text event_id_header "nullable — idempotency check"
        text payload_hash "NOT NULL — SHA256 of raw body"
        jsonb payload "NOT NULL"
        text processing_status "NOT NULL DEFAULT 'received' — received|processed|ignored|failed"
        text error_message "nullable"
        timestamptz received_at "NOT NULL DEFAULT now()"
    }

    integration_logs {
        uuid id PK "gen_random_uuid()"
        uuid connection_id FK "NOT NULL → integration_connections.id"
        text request_endpoint "NOT NULL"
        int response_status_code "NOT NULL"
        int duration_ms "NOT NULL"
        timestamptz executed_at "NOT NULL DEFAULT now()"
    }

    sync_status {
        uuid id PK "gen_random_uuid()"
        uuid connection_id FK "NOT NULL → integration_connections.id"
        text sync_domain "NOT NULL — inverter_telemetry|payment_reconciliation"
        timestamptz last_synced_at "NOT NULL DEFAULT now()"
        text last_cursor "nullable"
        int records_processed "NOT NULL DEFAULT 0"
    }
```

---

## 6. Audit Service (`audit_db`)

### 6.1 Overview
The Audit Service owns the centralized, tamper-resistant audit trail. It records every security-sensitive action, privileged override, role grant, relationship change, and financial update across the entire platform.

**Rules:**
1. **Strictly Append-Only:** Tables have no `UPDATE` or `DELETE` permissions granted to the runtime application user.
2. **Credential Cleanliness:** Passwords, OTPs, raw JWTs, and credit card numbers are strictly scrubbed before ingestion.
3. **Correlation:** Every record indexes `request_correlation_id` and `event_id` to trace distributed requests across microservices.

### 6.2 ERD
```mermaid
erDiagram
    audit_events {
        uuid id PK "gen_random_uuid()"
        uuid organisation_id "nullable — vendor tenant context; NULL for platform actions"
        uuid actor_user_id "NOT NULL — external Identity user ID"
        text actor_role "NOT NULL — role at time of action"
        text client_ip "NOT NULL"
        text user_agent "NOT NULL"
        text action "NOT NULL — e.g. 'quotation.issue', 'user.login', 'relationship.revoke'"
        text resource_type "NOT NULL — quotation|project|user|relationship|inventory_adjustment"
        uuid resource_id "NOT NULL — target entity UUID"
        text request_correlation_id "NOT NULL — distributed tracing ID"
        jsonb before_state "nullable — sanitized delta snapshot"
        jsonb after_state "nullable — sanitized delta snapshot"
        text result "NOT NULL DEFAULT 'success' — success|failure|denied"
        timestamptz recorded_at "NOT NULL DEFAULT now()"
    }
```

### 6.3 Audit Security Constraints
```sql
-- Revoke update and delete from application role
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM aethra_audit_app_role;

-- Compound indexes for fast audit forensics
CREATE INDEX idx_audit_org_time ON audit_events(organisation_id, recorded_at DESC);
CREATE INDEX idx_audit_resource ON audit_events(resource_type, resource_id);
CREATE INDEX idx_audit_correlation ON audit_events(request_correlation_id);
CREATE INDEX idx_audit_actor ON audit_events(actor_user_id, recorded_at DESC);
```
