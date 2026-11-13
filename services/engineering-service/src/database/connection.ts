// ==============================================================================
// AETHRA Engineering Service — Database Connection Manager
// ==============================================================================

import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAppConfig } from '@aethra/config';

const { Pool } = pg;
const config = loadAppConfig('engineering-service', 3009);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CalculationProfilesTable {
  id: string;
  organisation_id: string | null;
  code: string;
  name: string;
  system_category: 'rooftop_solar' | 'ground_mount' | 'bess' | 'hybrid';
  region_code: string;
  is_global: boolean;
  is_active: boolean;
  created_at: Date;
}

export interface CalculationProfileVersionsTable {
  id: string;
  profile_id: string;
  version_tag: string;
  formula_definitions: Record<string, unknown>;
  input_parameter_schema: Record<string, unknown>;
  effective_from: Date;
  effective_to: Date | null;
  is_locked: boolean;
}

export interface EngineeringEstimatesTable {
  id: string;
  organisation_id: string;
  estimate_code: string;
  profile_version_id: string;
  customer_id: string | null;
  property_id: string | null;
  lead_id: string | null;
  status: 'draft' | 'calculated' | 'approved' | 'superseded';
  calculated_by_user_id: string;
  calculated_at: Date;
  created_at: Date;
}

export interface EngineeringInputsTable {
  id: string;
  estimate_id: string;
  parameter_key: string;
  parameter_name: string;
  numeric_value: number | null;
  text_value: string | null;
  complex_value: Record<string, unknown> | null;
  unit: string;
  recorded_at: Date;
}

export interface CalculationOutputsTable {
  id: string;
  estimate_id: string;
  metric_key: string;
  metric_name: string;
  metric_value: number;
  unit: string;
  calculated_at: Date;
}

export interface CalculationAssumptionsTable {
  id: string;
  estimate_id: string;
  assumption_key: string;
  description: string;
  value: number;
  unit: string;
  source: string;
}

export interface BillOfMaterialsTable {
  id: string;
  estimate_id: string;
  organisation_id: string;
  bom_code: string;
  status: 'draft' | 'approved' | 'finalized';
  created_at: Date;
}

export interface BomVersionsTable {
  id: string;
  bom_id: string;
  version_number: number;
  notes: string | null;
  created_by_user_id: string;
  created_at: Date;
}

export interface BomItemsTable {
  id: string;
  bom_version_id: string;
  organisation_id: string;
  item_category: 'solar_module' | 'inverter' | 'mounting_structure' | 'dc_cable' | 'ac_cable' | 'ajb' | 'earthing' | 'bos';
  catalogue_product_id: string | null;
  item_name: string;
  specification_summary: string | null;
  quantity: number;
  unit: string;
  is_mandatory: boolean;
  created_at: Date;
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

export interface EngineeringDatabaseSchema {
  calculation_profiles: CalculationProfilesTable;
  calculation_profile_versions: CalculationProfileVersionsTable;
  engineering_estimates: EngineeringEstimatesTable;
  engineering_inputs: EngineeringInputsTable;
  calculation_outputs: CalculationOutputsTable;
  calculation_assumptions: CalculationAssumptionsTable;
  bill_of_materials: BillOfMaterialsTable;
  bom_versions: BomVersionsTable;
  bom_items: BomItemsTable;
  outbox_events: OutboxEventsTable;
}

export function createDatabaseClient(): Kysely<EngineeringDatabaseSchema> {
  const pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: 'engineering_db',
    user: config.database.user,
    password: config.database.password,
    min: config.database.poolMin,
    max: config.database.poolMax,
  });

  return new Kysely<EngineeringDatabaseSchema>({
    dialect: new PostgresDialect({ pool }),
  });
}

export async function runMigrations(db: Kysely<EngineeringDatabaseSchema>): Promise<void> {
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
