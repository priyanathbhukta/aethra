// ==============================================================================
// AETHRA Organisation Service — Database Connection & Tenant Isolation
// ==============================================================================

import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import { loadAppConfig } from '@aethra/config';

const { Pool } = pg;
const config = loadAppConfig('organisation-service', 3002);

export interface OrganisationDatabaseSchema {
  organisations: {
    id: string;
    legal_name: string;
    trade_name: string | null;
    status: string;
    created_at: Date;
    updated_at: Date;
  };
  branches: {
    id: string;
    organisation_id: string;
    branch_name: string;
    city: string;
    state: string;
    created_at: Date;
  };
}

export function createDatabaseClient(): Kysely<OrganisationDatabaseSchema> {
  const pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: 'organisation_db',
    user: config.database.user,
    password: config.database.password,
    min: config.database.poolMin,
    max: config.database.poolMax,
  });

  return new Kysely<OrganisationDatabaseSchema>({
    dialect: new PostgresDialect({ pool }),
  });
}

/**
 * Execute a callback within an isolated tenant transaction.
 * Strictly sets PostgreSQL session variable: `SET LOCAL app.current_organisation_id = :tenantId`
 */
export async function withTenantContext<T>(
  db: Kysely<OrganisationDatabaseSchema>,
  tenantId: string,
  callback: (trx: Kysely<OrganisationDatabaseSchema>) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (trx) => {
    // Set transaction-local tenant context for Row-Level Security
    await sql`SET LOCAL app.current_organisation_id = ${sql.raw(`'${tenantId}'`)}`.execute(trx);
    return callback(trx);
  });
}
