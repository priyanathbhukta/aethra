// ==============================================================================
// AETHRA Product Catalogue Service — Database Connection Manager
// ==============================================================================

import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAppConfig } from '@aethra/config';

const { Pool } = pg;
const config = loadAppConfig('catalogue-service', 3008);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ProductCategoriesTable {
  id: string;
  parent_category_id: string | null;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: Date;
}

export interface BrandsTable {
  id: string;
  name: string;
  origin_country: string;
  website_url: string | null;
  logo_url: string | null;
  is_verified: boolean;
  created_at: Date;
}

export interface UnitsTable {
  id: string;
  code: string;
  name: string;
  unit_category: 'power' | 'energy' | 'electrical' | 'dimension' | 'weight' | 'quantity';
}

export interface ProductModelsTable {
  id: string;
  category_id: string;
  brand_id: string;
  model_code: string;
  display_name: string;
  description: string | null;
  is_discontinued: boolean;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface ProductSpecificationsTable {
  id: string;
  category_id: string;
  spec_key: string;
  label: string;
  data_type: 'numeric' | 'text' | 'boolean' | 'range';
  default_unit_id: string | null;
  is_filterable: boolean;
  is_required: boolean;
  created_at: Date;
}

export interface SpecificationValuesTable {
  id: string;
  model_id: string;
  spec_id: string;
  text_value: string | null;
  numeric_value: number | null;
  unit_id: string | null;
  created_at: Date;
}

export interface ProductDocumentsTable {
  id: string;
  model_id: string;
  doc_type: 'datasheet' | 'installation_manual' | 'warranty_card' | 'certificate_bis' | 'certificate_iec';
  title: string;
  file_reference_id: string;
  created_at: Date;
}

export interface WarrantyTemplatesTable {
  id: string;
  model_id: string;
  standard_warranty_months: number;
  performance_warranty_months: number | null;
  guaranteed_efficiency_percent: number | null;
  terms_summary: string | null;
  created_at: Date;
}

export interface VendorCatalogueEntriesTable {
  id: string;
  organisation_id: string;
  model_id: string;
  vendor_sku: string;
  standard_cost_price: number;
  standard_selling_price: number;
  min_selling_price: number;
  tax_rate_percent: number;
  is_available: boolean;
  is_preferred: boolean;
  lead_time_days: number;
  vendor_notes: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface OutboxEventsTable {
  id: string;
  event_type: string;
  topic: string;
  partition_key: string;
  payload: Record<string, unknown>;
  correlation_id: string;
  status: 'pending' | 'processing' | 'published' | 'failed';
  retry_count: number;
  last_error: string | null;
  created_at: Date;
  processed_at: Date | null;
}

export interface CatalogueDatabaseSchema {
  product_categories: ProductCategoriesTable;
  brands: BrandsTable;
  units: UnitsTable;
  product_models: ProductModelsTable;
  product_specifications: ProductSpecificationsTable;
  specification_values: SpecificationValuesTable;
  product_documents: ProductDocumentsTable;
  warranty_templates: WarrantyTemplatesTable;
  vendor_catalogue_entries: VendorCatalogueEntriesTable;
  outbox_events: OutboxEventsTable;
}

export function createDatabaseClient(): Kysely<CatalogueDatabaseSchema> {
  const pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: 'catalogue_db',
    user: config.database.user,
    password: config.database.password,
    min: config.database.poolMin,
    max: config.database.poolMax,
  });

  return new Kysely<CatalogueDatabaseSchema>({
    dialect: new PostgresDialect({ pool }),
  });
}

export async function runMigrations(db: Kysely<CatalogueDatabaseSchema>): Promise<void> {
  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    return;
  }
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    await sql.raw(sqlContent).execute(db);
  }
}
