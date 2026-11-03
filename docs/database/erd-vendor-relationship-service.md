# AETHRA — Vendor Relationship Service ERD

> Phase 0 · Database: `vendor_relationship_db` · v0.1.0

---

## 1. Overview

The Vendor Relationship Service is the **security and governance bridge** of the AETHRA platform. It controls, records, and audits all multi-tenant interactions between vendor organisations and customer accounts.

**Architecture Rules:**
1. A customer record exists independently in Customer Service. A vendor only sees customer data if an explicit active relationship exists.
2. Even with an active relationship, vendor access is granular: access may be granted only for a specific purpose (e.g., `installation_epc`, `annual_maintenance`, `monitoring_only`), and only for specific properties or installations.
3. Access revocation is immediate: revoking a relationship or property grant invalidates vendor access tokens and cached policy decisions across all services.
4. An immutable audit record of consent and revocation is maintained.

---

## 2. ERD

```mermaid
erDiagram
    relationship_purposes ||--o{ vendor_customer_relationships : "categorized by"
    relationship_purposes ||--o{ customer_consents : "specifies"
    vendor_customer_relationships ||--o{ relationship_invitations : "initiated by"
    vendor_customer_relationships ||--o{ customer_consents : "authorized by"
    vendor_customer_relationships ||--o{ vendor_access_grants : "grants"
    vendor_customer_relationships ||--o{ access_revocation_history : "logs revocations"
    vendor_access_grants ||--o{ property_access_grants : "scopes to properties"
    property_access_grants ||--o{ installation_access_grants : "scopes to installations"

    relationship_purposes {
        uuid id PK "gen_random_uuid()"
        text code "NOT NULL, UNIQUE — epc_installation|amc_service|energy_audit|monitoring|retail_lead"
        text display_name "NOT NULL"
        text description "NOT NULL"
        text legal_terms_url "nullable"
        boolean requires_explicit_consent "NOT NULL DEFAULT true"
        timestamptz created_at "NOT NULL DEFAULT now()"
    }

    vendor_customer_relationships {
        uuid id PK "gen_random_uuid()"
        uuid organisation_id "NOT NULL — vendor tenant ID"
        uuid customer_id "NOT NULL — customer account ID"
        uuid purpose_id FK "NOT NULL → relationship_purposes.id"
        text status "NOT NULL DEFAULT 'pending' — pending|active|suspended|revoked|terminated"
        timestamptz initiated_at "NOT NULL DEFAULT now()"
        timestamptz activated_at "nullable"
        timestamptz expires_at "nullable — optional time-bound engagement"
        timestamptz revoked_at "nullable"
        jsonb metadata "nullable — tags, contract reference"
        timestamptz created_at "NOT NULL DEFAULT now()"
        timestamptz updated_at "NOT NULL DEFAULT now()"
    }

    relationship_invitations {
        uuid id PK "gen_random_uuid()"
        uuid organisation_id "NOT NULL — vendor tenant ID"
        uuid customer_id "nullable — if inviting known customer"
        text invitation_type "NOT NULL DEFAULT 'vendor_to_customer' — vendor_to_customer|customer_to_vendor"
        text recipient_email "nullable"
        text recipient_phone "NOT NULL"
        text invite_token_hash "NOT NULL, UNIQUE"
        uuid purpose_id FK "NOT NULL → relationship_purposes.id"
        jsonb proposed_scopes "NOT NULL — list of requested access scopes"
        text status "NOT NULL DEFAULT 'sent' — sent|accepted|declined|expired"
        timestamptz expires_at "NOT NULL"
        timestamptz accepted_at "nullable"
        timestamptz created_at "NOT NULL DEFAULT now()"
    }

    customer_consents {
        uuid id PK "gen_random_uuid()"
        uuid relationship_id FK "NOT NULL → vendor_customer_relationships.id"
        uuid customer_id "NOT NULL — customer account ID"
        uuid user_id "NOT NULL — Identity user ID of authorising signatory"
        uuid purpose_id FK "NOT NULL → relationship_purposes.id"
        text consent_version "NOT NULL — e.g. 'v1.2'"
        text consent_text_hash "NOT NULL — SHA-256 of legal consent presented"
        text ip_address "NOT NULL"
        text user_agent "NOT NULL"
        text consent_method "NOT NULL DEFAULT 'digital_signature' — digital_signature|otp_confirmation|contract_upload"
        timestamptz consented_at "NOT NULL DEFAULT now()"
        timestamptz valid_until "nullable"
        timestamptz revoked_at "nullable"
    }

    vendor_access_grants {
        uuid id PK "gen_random_uuid()"
        uuid relationship_id FK "NOT NULL → vendor_customer_relationships.id"
        uuid organisation_id "NOT NULL — vendor tenant ID"
        uuid customer_id "NOT NULL — customer account ID"
        text grant_type "NOT NULL DEFAULT 'profile_read' — profile_read|profile_write|full_billing|site_engineering"
        boolean is_active "NOT NULL DEFAULT true"
        timestamptz valid_from "NOT NULL DEFAULT now()"
        timestamptz valid_until "nullable"
        timestamptz created_at "NOT NULL DEFAULT now()"
        timestamptz revoked_at "nullable"
    }

    property_access_grants {
        uuid id PK "gen_random_uuid()"
        uuid grant_id FK "NOT NULL → vendor_access_grants.id"
        uuid property_id "NOT NULL — Customer Service customer_properties.id"
        text access_scope "NOT NULL DEFAULT 'read_write' — read_only|read_write|engineering_only"
        boolean is_active "NOT NULL DEFAULT true"
        timestamptz granted_at "NOT NULL DEFAULT now()"
        timestamptz revoked_at "nullable"
    }

    installation_access_grants {
        uuid id PK "gen_random_uuid()"
        uuid property_grant_id FK "NOT NULL → property_access_grants.id"
        uuid installation_id "NOT NULL — Customer Service property_installations.id"
        text access_scope "NOT NULL DEFAULT 'operational_read' — operational_read|telemetry_read|service_write"
        boolean is_active "NOT NULL DEFAULT true"
        timestamptz granted_at "NOT NULL DEFAULT now()"
        timestamptz revoked_at "nullable"
    }

    access_revocation_history {
        uuid id PK "gen_random_uuid()"
        uuid relationship_id FK "NOT NULL → vendor_customer_relationships.id"
        uuid organisation_id "NOT NULL — vendor tenant ID"
        uuid customer_id "NOT NULL — customer account ID"
        text target_type "NOT NULL — relationship|property|installation|grant"
        uuid target_id "NOT NULL — ID of revoked entity"
        text revoked_by_role "NOT NULL — customer_owner|vendor_owner|platform_admin|system_auto"
        uuid revoked_by_user_id "NOT NULL — Identity user ID"
        text revocation_reason "NOT NULL"
        timestamptz revoked_at "NOT NULL DEFAULT now()"
    }
```

---

## 3. Data Dictionary & Constraints

### 3.1 `vendor_customer_relationships`
- Unique constraint: `UNIQUE(organisation_id, customer_id, purpose_id)` prevents conflicting duplicate relationships for the same operational purpose.
- Status transition engine: Valid transitions: `pending → active → suspended ↔ active → revoked`.

### 3.2 `property_access_grants`
- Unique constraint: `UNIQUE(grant_id, property_id)`.
- Index: `CREATE INDEX idx_prop_grants_org_prop ON property_access_grants(property_id) WHERE is_active = true;`

---

## 4. Cross-Service References

| Local Column | Target Service | Entity Referenced | Handling / Enforcement |
|---|---|---|---|
| `organisation_id` | Organisation Service | `organisations.id` | Vendor organization |
| `customer_id` | Customer Service | `customer_accounts.id` | Customer account |
| `property_access_grants.property_id` | Customer Service | `customer_properties.id` | Target property |
| `installation_access_grants.installation_id` | Customer Service | `property_installations.id` | Target solar/BESS setup |
| `customer_consents.user_id` | Identity Service | `users.id` | Signatory of digital consent |

---

## 5. Security & Isolation

- **Revocation Propagation:** On insert into `access_revocation_history`, the service publishes `vendor_relationship.revoked.v1` to Kafka with payload:
  `{ relationship_id, organisation_id, customer_id, property_id, installation_id, revoked_at }`.
- Dependent services (Quotation, Project, Service Management, Document) immediately invalidate cached access grants in Redis for that `(organisation_id, customer_id)` pair.
- Vendor tenant isolation policy:
  ```sql
  CREATE POLICY vendor_isolation ON vendor_customer_relationships
    USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);
  ```
