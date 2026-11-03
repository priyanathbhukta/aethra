# AETHRA — Procurement Service ERD

> Phase 0 · Database: `procurement_db` · v0.1.0

---

## 1. Overview

The Procurement Service manages supplier master records, purchase requisitions, supplier quotation comparisons, purchase orders (POs), line-item tracking, goods receipt coordination, and vendor bill/invoice records.

**Fundamental Architecture Rules:**
1. **Zero Direct Inventory Writes:** The Procurement Service never directly writes to the `inventory_db`. When a Goods Receipt is finalized in Procurement, it publishes the domain event `procurement.goods_receipt.confirmed.v1` (or calls the Inventory Service REST intake endpoint). The Inventory Service independently verifies physical quantities and writes to its own append-only ledger.
2. **Vendor Multi-Tenant Isolation:** All procurement contracts, supplier pricing negotiations, purchase orders, and payment terms are strictly isolated to the owning vendor organization (`organisation_id`).
3. **Traceability:** Procurement links back to project requirements through purchase requisitions generated from project Bill of Materials (BOM).

---

## 2. ERD

```mermaid
erDiagram
    suppliers ||--o{ purchase_orders : "supplies"
    purchase_requisitions ||--o{ purchase_requisition_lines : "contains"
    purchase_orders ||--o{ purchase_order_lines : "contains"
    purchase_requisition_lines ||--o{ purchase_order_lines : "converted to"
    purchase_orders ||--o{ goods_receipts : "received against"
    goods_receipts ||--o{ goods_receipt_lines : "itemizes"
    purchase_orders ||--o{ supplier_invoice_references : "billed against"

    suppliers {
        uuid id PK "gen_random_uuid()"
        uuid organisation_id "NOT NULL — vendor tenant ID"
        text supplier_code "NOT NULL — e.g. 'SUP-2026-0018'"
        text legal_name "NOT NULL"
        text trade_name "nullable"
        text gst_number "nullable"
        text pan_tax_id "nullable"
        text contact_person "NOT NULL"
        text email "NOT NULL"
        text phone "NOT NULL"
        text address "NOT NULL"
        text city "NOT NULL"
        text state "NOT NULL"
        text postal_code "NOT NULL"
        text payment_terms_default "NOT NULL DEFAULT 'net_30' — advance|net_15|net_30|net_60"
        boolean is_active "NOT NULL DEFAULT true"
        timestamptz created_at "NOT NULL DEFAULT now()"
        timestamptz updated_at "NOT NULL DEFAULT now()"
    }

    purchase_requisitions {
        uuid id PK "gen_random_uuid()"
        uuid organisation_id "NOT NULL — vendor tenant ID"
        text requisition_code "NOT NULL — e.g. 'PR-2026-0051'"
        uuid requested_by_user_id "NOT NULL — external Identity user ID"
        uuid project_id "nullable — external Project Service projects.id"
        uuid destination_warehouse_id "NOT NULL — external Org/Inventory warehouse ID"
        text status "NOT NULL DEFAULT 'draft' — draft|pending_approval|approved|rejected|converted_to_po"
        text urgency "NOT NULL DEFAULT 'medium' — low|medium|high|critical"
        timestamptz required_by_date "NOT NULL"
        uuid approved_by_user_id "nullable"
        timestamptz approved_at "nullable"
        timestamptz created_at "NOT NULL DEFAULT now()"
    }

    purchase_requisition_lines {
        uuid id PK "gen_random_uuid()"
        uuid requisition_id FK "NOT NULL → purchase_requisitions.id"
        uuid organisation_id "NOT NULL — vendor tenant ID"
        uuid catalogue_product_id "NOT NULL — external Catalogue Service product_models.id"
        text item_description "NOT NULL"
        numeric quantity "NOT NULL"
        text unit "NOT NULL DEFAULT 'nos'"
        numeric estimated_unit_cost "nullable"
        text status "NOT NULL DEFAULT 'open' — open|ordered|cancelled"
    }

    purchase_orders {
        uuid id PK "gen_random_uuid()"
        uuid organisation_id "NOT NULL — vendor tenant ID"
        text po_number "NOT NULL — e.g. 'PO-2026-0077'"
        uuid supplier_id FK "NOT NULL → suppliers.id"
        uuid requisition_id FK "nullable → purchase_requisitions.id"
        uuid destination_warehouse_id "NOT NULL — external warehouse ID"
        text status "NOT NULL DEFAULT 'draft' — draft|issued|confirmed|partially_received|fully_received|closed|cancelled"
        timestamptz order_date "NOT NULL DEFAULT now()"
        timestamptz expected_delivery_date "NOT NULL"
        numeric subtotal_amount "NOT NULL DEFAULT 0.00"
        numeric tax_amount "NOT NULL DEFAULT 0.00"
        numeric total_amount "NOT NULL DEFAULT 0.00"
        text payment_terms "NOT NULL"
        text shipping_terms "NOT NULL DEFAULT 'fob_site' — ex_works|fob_site|cif"
        uuid created_by_user_id "NOT NULL — external Identity user ID"
        timestamptz created_at "NOT NULL DEFAULT now()"
        timestamptz updated_at "NOT NULL DEFAULT now()"
    }

    purchase_order_lines {
        uuid id PK "gen_random_uuid()"
        uuid po_id FK "NOT NULL → purchase_orders.id"
        uuid requisition_line_id FK "nullable → purchase_requisition_lines.id"
        uuid organisation_id "NOT NULL — vendor tenant ID"
        uuid catalogue_product_id "NOT NULL — external Catalogue Service product_models.id"
        text item_description "NOT NULL"
        numeric ordered_quantity "NOT NULL"
        numeric received_quantity "NOT NULL DEFAULT 0.00"
        text unit "NOT NULL DEFAULT 'nos'"
        numeric unit_price "NOT NULL"
        numeric tax_rate_percent "NOT NULL DEFAULT 13.8"
        numeric line_total "NOT NULL"
        timestamptz created_at "NOT NULL DEFAULT now()"
    }

    goods_receipts {
        uuid id PK "gen_random_uuid()"
        uuid organisation_id "NOT NULL — vendor tenant ID"
        text grn_code "NOT NULL — e.g. 'P-GRN-2026-0033'"
        uuid po_id FK "NOT NULL → purchase_orders.id"
        uuid supplier_id FK "NOT NULL → suppliers.id"
        uuid destination_warehouse_id "NOT NULL"
        text delivery_challan_number "NOT NULL"
        text transporter_name "nullable"
        text vehicle_number "nullable"
        text inspection_status "NOT NULL DEFAULT 'pending' — pending|accepted|rejected|partial_defect"
        uuid inspected_by_user_id "NOT NULL — external Identity user ID"
        timestamptz received_at "NOT NULL DEFAULT now()"
    }

    goods_receipt_lines {
        uuid id PK "gen_random_uuid()"
        uuid goods_receipt_id FK "NOT NULL → goods_receipts.id"
        uuid po_line_id FK "NOT NULL → purchase_order_lines.id"
        uuid organisation_id "NOT NULL — vendor tenant ID"
        uuid catalogue_product_id "NOT NULL"
        numeric quantity_delivered "NOT NULL"
        numeric quantity_accepted "NOT NULL"
        numeric quantity_rejected "NOT NULL DEFAULT 0.00"
        text rejection_reason "nullable"
        text batch_code "nullable"
        jsonb serial_numbers "nullable — JSON array of scanned serials"
    }

    supplier_invoice_references {
        uuid id PK "gen_random_uuid()"
        uuid organisation_id "NOT NULL — vendor tenant ID"
        uuid po_id FK "NOT NULL → purchase_orders.id"
        uuid supplier_id FK "NOT NULL → suppliers.id"
        text invoice_number "NOT NULL"
        date invoice_date "NOT NULL"
        numeric invoice_amount "NOT NULL"
        numeric tax_amount "NOT NULL"
        text payment_status "NOT NULL DEFAULT 'unpaid' — unpaid|partially_paid|paid"
        text document_file_id "nullable — external Document Service files.id"
        timestamptz created_at "NOT NULL DEFAULT now()"
    }
```

---

## 3. Data Dictionary & Constraints

### 3.1 `suppliers`
- Unique constraint: `UNIQUE(organisation_id, supplier_code)`.
- Index: `CREATE INDEX idx_suppliers_gst ON suppliers(organisation_id, gst_number) WHERE gst_number IS NOT NULL;`

### 3.2 `purchase_orders`
- Unique constraint: `UNIQUE(organisation_id, po_number)`.

---

## 4. Cross-Service References

| Local Column | Target Service | Entity Referenced | Relationship |
|---|---|---|---|
| `organisation_id` | Organisation Service | `organisations.id` | Vendor tenant boundary |
| `project_id` | Project Service | `projects.id` | Originating project demanding materials |
| `destination_warehouse_id` | Organisation Service | `warehouses.id` | Delivery destination |
| `catalogue_product_id` | Catalogue Service | `product_models.id` | Catalogue model specification |
| `created_by_user_id` | Identity Service | `users.id` | Procurement specialist |
| `document_file_id` | Document Service | `files.id` | Uploaded scan of supplier tax invoice |

---

## 5. Security & Isolation

- Row-level security on all tables:
  ```sql
  CREATE POLICY procurement_vendor_isolation ON purchase_orders
    USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);
  ```
- Subscriptions check: Requires active entitlement for the `procurement` module.
- Event emission: Confirmation of a Goods Receipt emits `procurement.goods_receipt.confirmed.v1`, prompting Inventory Service to execute physical ledger receipt.
