# AETHRA — Engineering & Estimation Service ERD

> Phase 0 · Database: `engineering_db` · v0.1.0

---

## 1. Overview

The Engineering & Estimation Service is the technical sizing and Bill of Materials (BOM) calculation engine of the AETHRA platform. It evaluates site solar irradiation, roof tilt/azimuth, shadow losses, load profiles, inverter-to-module string sizing, battery capacity requirements, and generates versioned engineering estimates.

**Fundamental Architecture Rules:**
1. **Calculation Reproducibility & Immutability:** Engineering calculations must remain 100% reproducible over time. Every estimate permanently records:
   - All input values and their exact units.
   - The exact rule/formula version (`calculation_profile_versions.id`).
   - All explicit assumptions (e.g., derating factor = 0.78, specific yield = 1500 kWh/kWp/year).
   - Calculation timestamp and engine version.
2. **Strict Separation of Engineering Rules:** The calculation engine does not invent formulas on the fly. It executes parameterized calculation profiles configured per region, discom standard, or vendor preference.
3. **Bill of Materials (BOM) Versioning:** Engineering outputs compile directly into BOM versions, which specify exact quantities of modules, inverters, structures, cables, and junction boxes for downstream quotation and procurement.

---

## 2. ERD

```mermaid
erDiagram
    calculation_profiles ||--o{ calculation_profile_versions : "versions"
    calculation_profile_versions ||--o{ engineering_estimates : "governs calculation"
    engineering_estimates ||--o{ engineering_inputs : "records inputs"
    engineering_estimates ||--o{ calculation_outputs : "produces results"
    engineering_estimates ||--o{ calculation_assumptions : "records assumptions"
    engineering_estimates ||--o{ bill_of_materials : "generates BOM"
    bill_of_materials ||--o{ bom_versions : "versions"
    bom_versions ||--o{ bom_items : "contains"
    calculation_profiles ||--o{ engineering_disclaimers : "attaches"

    calculation_profiles {
        uuid id PK "gen_random_uuid()"
        uuid organisation_id "nullable — NULL for platform global standards, org UUID for custom profiles"
        text code "NOT NULL, UNIQUE — e.g. 'in_mnre_residential_v1', 'in_commercial_bess_v1'"
        text name "NOT NULL"
        text system_category "NOT NULL — rooftop_solar|ground_mount|bess|hybrid"
        text region_code "NOT NULL DEFAULT 'IN'"
        boolean is_global "NOT NULL DEFAULT false"
        boolean is_active "NOT NULL DEFAULT true"
        timestamptz created_at "NOT NULL DEFAULT now()"
    }

    calculation_profile_versions {
        uuid id PK "gen_random_uuid()"
        uuid profile_id FK "NOT NULL → calculation_profiles.id"
        text version_tag "NOT NULL — e.g. 'v1.4.2'"
        jsonb formula_definitions "NOT NULL — formula keys, algorithms, coefficients"
        jsonb input_parameter_schema "NOT NULL — JSON Schema defining required inputs"
        timestamptz effective_from "NOT NULL DEFAULT now()"
        timestamptz effective_to "nullable"
        boolean is_locked "NOT NULL DEFAULT true"
    }

    engineering_estimates {
        uuid id PK "gen_random_uuid()"
        uuid organisation_id "NOT NULL — vendor tenant ID"
        text estimate_code "NOT NULL — e.g. 'EST-2026-0105'"
        uuid profile_version_id FK "NOT NULL → calculation_profile_versions.id"
        uuid customer_id "nullable — external Customer Service customer_accounts.id"
        uuid property_id "nullable — external Customer Service customer_properties.id"
        uuid lead_id "nullable — external CRM Service leads.id"
        text status "NOT NULL DEFAULT 'draft' — draft|calculated|approved|superseded"
        uuid calculated_by_user_id "NOT NULL — external Identity user ID"
        timestamptz calculated_at "NOT NULL DEFAULT now()"
        timestamptz created_at "NOT NULL DEFAULT now()"
    }

    engineering_inputs {
        uuid id PK "gen_random_uuid()"
        uuid estimate_id FK "NOT NULL → engineering_estimates.id"
        text parameter_key "NOT NULL — e.g. sanction_load_kw, monthly_units_kwh, roof_usable_area_sqm, tilt_angle, azimuth_deg"
        text parameter_name "NOT NULL"
        numeric numeric_value "nullable"
        text text_value "nullable"
        jsonb complex_value "nullable — e.g. hourly load curve array"
        text unit "NOT NULL — kW, kWh, sqm, deg, V"
        timestamptz recorded_at "NOT NULL DEFAULT now()"
    }

    calculation_outputs {
        uuid id PK "gen_random_uuid()"
        uuid estimate_id FK "NOT NULL → engineering_estimates.id"
        text metric_key "NOT NULL — e.g. recommended_capacity_kw, annual_generation_kwh, co2_offset_tons, performance_ratio"
        text metric_name "NOT NULL"
        numeric metric_value "NOT NULL"
        text unit "NOT NULL — kWp, kWh/yr, tons/yr, percent"
        timestamptz calculated_at "NOT NULL DEFAULT now()"
    }

    calculation_assumptions {
        uuid id PK "gen_random_uuid()"
        uuid estimate_id FK "NOT NULL → engineering_estimates.id"
        text assumption_key "NOT NULL — e.g. specific_yield, derate_factor, annual_degradation, grid_tariff_escalation"
        text description "NOT NULL"
        numeric value "NOT NULL"
        text unit "NOT NULL"
        text source "NOT NULL — e.g. 'NREL NSRDB 2024', 'MNRE Benchmark', 'Default Vendor Standard'"
    }

    bill_of_materials {
        uuid id PK "gen_random_uuid()"
        uuid estimate_id FK "NOT NULL → engineering_estimates.id"
        uuid organisation_id "NOT NULL — vendor tenant ID"
        text bom_code "NOT NULL — e.g. 'BOM-2026-0089'"
        text status "NOT NULL DEFAULT 'draft' — draft|approved|finalized"
        timestamptz created_at "NOT NULL DEFAULT now()"
    }

    bom_versions {
        uuid id PK "gen_random_uuid()"
        uuid bom_id FK "NOT NULL → bill_of_materials.id"
        int version_number "NOT NULL DEFAULT 1"
        text notes "nullable"
        uuid created_by_user_id "NOT NULL — external Identity user ID"
        timestamptz created_at "NOT NULL DEFAULT now()"
    }

    bom_items {
        uuid id PK "gen_random_uuid()"
        uuid bom_version_id FK "NOT NULL → bom_versions.id"
        uuid organisation_id "NOT NULL — vendor tenant ID"
        text item_category "NOT NULL — solar_module|inverter|mounting_structure|dc_cable|ac_cable|ajb|earthing|bos"
        uuid catalogue_product_id "nullable — external Catalogue Service product_models.id"
        text item_name "NOT NULL"
        text specification_summary "nullable"
        numeric quantity "NOT NULL"
        text unit "NOT NULL DEFAULT 'nos'"
        boolean is_mandatory "NOT NULL DEFAULT true"
        timestamptz created_at "NOT NULL DEFAULT now()"
    }

    engineering_disclaimers {
        uuid id PK "gen_random_uuid()"
        uuid profile_id FK "NOT NULL → calculation_profiles.id"
        int display_order "NOT NULL DEFAULT 1"
        text disclaimer_text "NOT NULL — e.g. 'Generation estimates subject to shading analysis and grid availability.'"
        boolean is_mandatory "NOT NULL DEFAULT true"
    }
```

---

## 3. Data Dictionary & Constraints

### 3.1 `engineering_estimates`
- Unique constraint: `UNIQUE(organisation_id, estimate_code)`.
- Immutability: Once `status = 'approved'`, estimate inputs, outputs, and assumptions are locked.

### 3.2 `engineering_inputs`
- Unique constraint: `UNIQUE(estimate_id, parameter_key)` ensures single parameter assignment per estimate.

### 3.3 `bom_versions`
- Unique constraint: `UNIQUE(bom_id, version_number)`.

---

## 4. Cross-Service References

| Local Column | Target Service | Entity Referenced | Relationship |
|---|---|---|---|
| `organisation_id` | Organisation Service | `organisations.id` | Vendor tenant boundary |
| `customer_id` | Customer Service | `customer_accounts.id` | Client account |
| `property_id` | Customer Service | `customer_properties.id` | Physical rooftop/ground site |
| `lead_id` | CRM Service | `leads.id` | CRM inquiry link |
| `bom_items.catalogue_product_id` | Catalogue Service | `product_models.id` | OEM equipment specifications |
| `calculated_by_user_id` | Identity Service | `users.id` | System engineer author |

---

## 5. Security & Isolation

- Row-level security on all tenant tables:
  ```sql
  CREATE POLICY engineering_tenant_isolation ON engineering_estimates
    USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);
  ```
- Subscriptions check: Requires active entitlement for the `engineering` module.
- Generates `engineering.estimate.completed.v1` and `engineering.bom.generated.v1` events for consumption by Quotation Service.
