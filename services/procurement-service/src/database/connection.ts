// ==============================================================================
// AETHRA Procurement Service — Database Connection & Typed Kysely Schema
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { loadAppConfig } from '@aethra/config';
import { createStructuredLogger } from '@aethra/observability';

const { Pool } = pg;
const logger = createStructuredLogger('procurement-service-db');
const config = loadAppConfig('procurement-service', 3012);

export interface SuppliersTable {
  id: string;
  organisation_id: string;
  supplier_code: string;
  legal_name: string;
  trade_name: string | null;
  gst_number: string | null;
  pan_tax_id: string | null;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  payment_terms_default: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PurchaseRequisitionsTable {
  id: string;
  organisation_id: string;
  requisition_code: string;
  requested_by_user_id: string;
  project_id: string | null;
  destination_warehouse_id: string;
  status: string;
  urgency: string;
  required_by_date: Date;
  approved_by_user_id: string | null;
  approved_at: Date | null;
  created_at: Date;
}

export interface PurchaseRequisitionLinesTable {
  id: string;
  requisition_id: string;
  organisation_id: string;
  catalogue_product_id: string;
  item_description: string;
  quantity: number | string;
  unit: string;
  estimated_unit_cost: number | string | null;
  status: string;
}

export interface PurchaseOrdersTable {
  id: string;
  organisation_id: string;
  po_number: string;
  supplier_id: string;
  requisition_id: string | null;
  destination_warehouse_id: string;
  status: string;
  order_date: Date;
  expected_delivery_date: Date;
  subtotal_amount: number | string;
  tax_amount: number | string;
  total_amount: number | string;
  payment_terms: string;
  shipping_terms: string;
  created_by_user_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface PurchaseOrderLinesTable {
  id: string;
  po_id: string;
  requisition_line_id: string | null;
  organisation_id: string;
  catalogue_product_id: string;
  item_description: string;
  ordered_quantity: number | string;
  received_quantity: number | string;
  unit: string;
  unit_price: number | string;
  tax_rate_percent: number | string;
  line_total: number | string;
  created_at: Date;
}

export interface GoodsReceiptsTable {
  id: string;
  organisation_id: string;
  grn_code: string;
  po_id: string;
  supplier_id: string;
  destination_warehouse_id: string;
  delivery_challan_number: string;
  transporter_name: string | null;
  vehicle_number: string | null;
  inspection_status: string;
  inspected_by_user_id: string;
  received_at: Date;
}

export interface GoodsReceiptLinesTable {
  id: string;
  goods_receipt_id: string;
  po_line_id: string;
  organisation_id: string;
  catalogue_product_id: string;
  quantity_delivered: number | string;
  quantity_accepted: number | string;
  quantity_rejected: number | string;
  rejection_reason: string | null;
  batch_code: string | null;
  serial_numbers: Record<string, unknown> | null;
}

export interface SupplierInvoiceReferencesTable {
  id: string;
  organisation_id: string;
  po_id: string;
  supplier_id: string;
  invoice_number: string;
  invoice_date: Date;
  invoice_amount: number | string;
  tax_amount: number | string;
  payment_status: string;
  document_file_id: string | null;
  created_at: Date;
}

export interface OutboxEventsTable {
  id: string;
  event_type: string;
  topic: string;
  partition_key: string;
  payload: Record<string, unknown>;
  correlation_id: string;
  status: string;
  retry_count: number;
  created_at: Date;
  processed_at?: Date | null;
}

export interface ProcurementDatabaseSchema {
  suppliers: SuppliersTable;
  purchase_requisitions: PurchaseRequisitionsTable;
  purchase_requisition_lines: PurchaseRequisitionLinesTable;
  purchase_orders: PurchaseOrdersTable;
  purchase_order_lines: PurchaseOrderLinesTable;
  goods_receipts: GoodsReceiptsTable;
  goods_receipt_lines: GoodsReceiptLinesTable;
  supplier_invoice_references: SupplierInvoiceReferencesTable;
  outbox_events: OutboxEventsTable;
}

export function createDatabaseClient(): Kysely<ProcurementDatabaseSchema> {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      `postgresql://${config.database.user}:${config.database.password}@${config.database.host}:${config.database.port}/procurement_db`,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  return new Kysely<ProcurementDatabaseSchema>({
    dialect: new PostgresDialect({ pool }),
  });
}

export async function runMigrations(db: Kysely<any>): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const migrationsDir = path.join(__dirname, 'migrations');

  if (!fs.existsSync(migrationsDir)) return;

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sqlContent = fs.readFileSync(filePath, 'utf-8');
    logger.info({ migration: file }, 'Executing procurement_db migration');
    await sql.raw(sqlContent).execute(db);
  }
}
