# AETHRA — Customer Service ERD

> Phase 0 · Database: `customer_db` · v0.1.0

---

## 1. Overview

The Customer Service owns core customer identities, profiles, contacts, customer-linked user accounts, customer real estate properties, property-level installations (e.g. rooftop solar setups), equipment asset registers, and property access delegations.

**Fundamental Architecture Rule:**
- Customer accounts and customer properties are **independent of any single vendor**.
- A customer (e.g., a homeowner or factory owner) may interact with Vendor A for a 10kW solar installation, Vendor B for battery energy storage, and Vendor C for annual maintenance.
- Vendor access to customer and property data is governed explicitly through the **Vendor Relationship Service**, never by hardcoding a `vendor_id` or single `organisation_id` foreign key on the customer record.

---

## 2. ERD

```mermaid
erDiagram
    customer_accounts ||--o{ customer_profiles : "has"
    customer_accounts ||--o{ customer_contacts : "has"
    customer_accounts ||--o{ customer_users : "mapped to"
    customer_accounts ||--o{ customer_properties : "owns"
    customer_properties ||--o{ property_installations : "hosts"
    customer_properties ||--o{ property_access_delegations : "delegates"
    property_installations ||--o{ property_assets : "contains"

    customer_accounts {
        uuid id PK "gen_random_uuid()"
        text account_type "NOT NULL DEFAULT 'individual' — individual|commercial|industrial|society"
        text legal_name "NOT NULL"
        text display_name "NOT NULL"
        text pan_tax_id "nullable"
        text gst_number "nullable"
        text status "NOT NULL DEFAULT 'active' — active|suspended|archived"
        timestamptz created_at "NOT NULL DEFAULT now()"
        timestamptz updated_at "NOT NULL DEFAULT now()"
    }

    customer_profiles {
        uuid id PK "gen_random_uuid()"
        uuid customer_id FK "NOT NULL, UNIQUE → customer_accounts.id"
        text primary_email "NOT NULL"
        text primary_phone "NOT NULL"
        text alternate_phone "nullable"
        text language_preference "NOT NULL DEFAULT 'en'"
        text avatar_url "nullable"
        jsonb metadata "nullable — preferences, tags"
        timestamptz updated_at "NOT NULL DEFAULT now()"
    }

    customer_contacts {
        uuid id PK "gen_random_uuid()"
        uuid customer_id FK "NOT NULL → customer_accounts.id"
        text contact_name "NOT NULL"
        text role_designation "nullable — e.g. Owner, Facility Manager, Billing Contact"
        text email "nullable"
        text phone "NOT NULL"
        boolean is_primary "NOT NULL DEFAULT false"
        timestamptz created_at "NOT NULL DEFAULT now()"
    }

    customer_users {
        uuid id PK "gen_random_uuid()"
        uuid customer_id FK "NOT NULL → customer_accounts.id"
        uuid user_id "NOT NULL — external Identity Service users.id"
        text customer_role "NOT NULL DEFAULT 'owner' — owner|manager|viewer|family_member"
        boolean is_active "NOT NULL DEFAULT true"
        timestamptz linked_at "NOT NULL DEFAULT now()"
    }

    customer_properties {
        uuid id PK "gen_random_uuid()"
        uuid customer_id FK "NOT NULL → customer_accounts.id"
        text property_name "NOT NULL — e.g. 'Greenwood Villa' or 'Plant 3'"
        text property_type "NOT NULL — residential|commercial|industrial|agricultural"
        text address_line1 "NOT NULL"
        text address_line2 "nullable"
        text city "NOT NULL"
        text state "NOT NULL"
        text postal_code "NOT NULL"
        text country "NOT NULL DEFAULT 'IN'"
        numeric latitude "nullable"
        numeric longitude "nullable"
        text discom_name "nullable — Electricity Distribution Company (e.g. BESCOM, MSEDCL)"
        text consumer_number "nullable — electricity connection CA/account number"
        numeric sanctioned_load_kw "nullable"
        numeric tariff_rate "nullable"
        timestamptz created_at "NOT NULL DEFAULT now()"
        timestamptz updated_at "NOT NULL DEFAULT now()"
    }

    property_installations {
        uuid id PK "gen_random_uuid()"
        uuid property_id FK "NOT NULL → customer_properties.id"
        text installation_name "NOT NULL — e.g. 'Rooftop Solar 10kWp Phase 1'"
        text system_type "NOT NULL — solar_rooftop|solar_ground|bess|ev_charging|hybrid"
        text grid_type "NOT NULL DEFAULT 'on_grid' — on_grid|off_grid|hybrid|microgrid"
        numeric capacity_kw "NOT NULL"
        text status "NOT NULL DEFAULT 'planned' — planned|under_construction|commissioned|operational|decommissioned"
        date commissioned_date "nullable"
        text commissioning_certificate_doc_id "nullable — external Document Service ID"
        timestamptz created_at "NOT NULL DEFAULT now()"
        timestamptz updated_at "NOT NULL DEFAULT now()"
    }

    property_assets {
        uuid id PK "gen_random_uuid()"
        uuid installation_id FK "NOT NULL → property_installations.id"
        uuid property_id FK "NOT NULL → customer_properties.id"
        text asset_type "NOT NULL — solar_panel|inverter|battery|meter|charge_controller"
        text brand "nullable"
        text model_number "nullable"
        text serial_number "nullable"
        uuid catalogue_product_id "nullable — external Catalogue Service product_models.id"
        date warranty_start_date "nullable"
        date warranty_end_date "nullable"
        jsonb technical_specs "nullable — rated capacity, voltage, firmware"
        text status "NOT NULL DEFAULT 'operational' — operational|degraded|faulty|replaced"
        timestamptz created_at "NOT NULL DEFAULT now()"
        timestamptz updated_at "NOT NULL DEFAULT now()"
    }

    property_access_delegations {
        uuid id PK "gen_random_uuid()"
        uuid property_id FK "NOT NULL → customer_properties.id"
        uuid customer_id FK "NOT NULL → customer_accounts.id"
        uuid user_id "NOT NULL — external Identity Service users.id"
        text access_level "NOT NULL DEFAULT 'read_only' — read_only|manage_maintenance|full_property_admin"
        timestamptz valid_until "nullable"
        timestamptz created_at "NOT NULL DEFAULT now()"
    }
```

---

## 3. Data Dictionary & Constraints

### 3.1 `customer_accounts`
- PK: `id` (UUID).
- Uniqueness: Optional composite check on `(pan_tax_id)` and `(gst_number)` where not null.

### 3.2 `customer_users`
- Constraint: `UNIQUE(customer_id, user_id)` ensures a user cannot have duplicate mappings to the same customer account.
- Index: `CREATE INDEX idx_customer_users_user_id ON customer_users(user_id);` enables fast lookup of all customer accounts accessible by a logged-in user.

### 3.3 `customer_properties`
- Index: `CREATE INDEX idx_customer_properties_customer ON customer_properties(customer_id);`
- Index: `CREATE INDEX idx_customer_properties_geo ON customer_properties(postal_code, city);`

### 3.4 `property_assets`
- Index: `CREATE INDEX idx_property_assets_serial ON property_assets(serial_number) WHERE serial_number IS NOT NULL;`

---

## 4. Cross-Service References

| Local Column | Target Service | Entity Referenced | Relationship Description |
|---|---|---|---|
| `customer_users.user_id` | Identity Service | `users.id` | Maps login credentials to customer portal permissions |
| `property_access_delegations.user_id` | Identity Service | `users.id` | Delegated family/caretaker access |
| `property_assets.catalogue_product_id` | Product Catalogue | `product_models.id` | Connects deployed equipment to official OEM catalogue specifications |
| `property_installations.commissioning_certificate_doc_id` | Document Service | `files.id` | Pointer to uploaded handover/discom document |

---

## 5. Security & Access Rules

- Direct customer portal access uses `customer_users` mapping verified via JWT sub claims.
- **Vendor access is never direct**: When a vendor API queries customer records, the request passes through the **Vendor Relationship Service**, which checks if an active, non-revoked grant exists for `(organisation_id, customer_id, property_id)`.
- RLS policy on Customer Service evaluates vendor grants through contextual session attributes or cached grant tokens passed by the API Gateway/BFF.
