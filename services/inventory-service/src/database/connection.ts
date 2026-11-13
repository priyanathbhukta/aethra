// ==============================================================================
// AETHRA Inventory Service — Database Connection & Typed Kysely Schema
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { loadAppConfig } from '@aethra/config';
import { createStructuredLogger } from '@aethra/observability';

const { Pool } = pg;
const logger = createStructuredLogger('inventory-service-db');
const config = loadAppConfig('inventory-service', 3011);

export interface WarehousesTable {
  id: string;
  organisation_id: string;
  warehouse_code: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  is_active: boolean;
  created_at: Date;
}

export interface StockBalancesTable {
  id: string;
  organisation_id: string;
  warehouse_id: string;
  catalogue_product_id: string;
  on_hand_quantity: number | string;
  reserved_quantity: number | string;
  available_quantity: number | string;
  average_unit_cost: number | string;
  last_movement_at: Date;
  updated_at: Date;
}

export interface StockLedgerEntriesTable {
  id: string;
  organisation_id: string;
  warehouse_id: string;
  catalogue_product_id: string;
  movement_type: string;
  quantity: number | string;
  unit_cost: number | string;
  total_cost: number | string;
  balance_after: number | string;
  reference_doc_type: string;
  reference_doc_id: string;
  batch_id: string | null;
  created_by_user_id: string;
  posted_at: Date;
}

export interface StockReservationsTable {
  id: string;
  organisation_id: string;
  warehouse_id: string;
  catalogue_product_id: string;
  project_id: string;
  quantity_reserved: number | string;
  quantity_fulfilled: number | string;
  status: string;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface StockReceiptsTable {
  id: string;
  organisation_id: string;
  receipt_code: string;
  warehouse_id: string;
  purchase_order_id: string | null;
  supplier_id: string | null;
  status: string;
  received_by_user_id: string;
  posted_at: Date | null;
  created_at: Date;
}

export interface StockIssuesTable {
  id: string;
  organisation_id: string;
  issue_code: string;
  warehouse_id: string;
  project_id: string | null;
  reservation_id: string | null;
  reason: string;
  issued_to_user_id: string;
  issued_at: Date;
}

export interface SerialNumbersTable {
  id: string;
  organisation_id: string;
  catalogue_product_id: string;
  serial_number: string;
  current_warehouse_id: string | null;
  assigned_project_id: string | null;
  status: string;
  registered_at: Date;
  updated_at: Date;
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

export interface InventoryDatabaseSchema {
  warehouses: WarehousesTable;
  stock_balances: StockBalancesTable;
  stock_ledger_entries: StockLedgerEntriesTable;
  stock_reservations: StockReservationsTable;
  stock_receipts: StockReceiptsTable;
  stock_issues: StockIssuesTable;
  serial_numbers: SerialNumbersTable;
  outbox_events: OutboxEventsTable;
}

export function createDatabaseClient(): Kysely<InventoryDatabaseSchema> {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      `postgresql://${config.database.user}:${config.database.password}@${config.database.host}:${config.database.port}/inventory_db`,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  return new Kysely<InventoryDatabaseSchema>({
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
    logger.info({ migration: file }, 'Executing inventory_db migration');
    await sql.raw(sqlContent).execute(db);
  }
}
