// ==============================================================================
// AETHRA Identity Service — Database Connection Manager
// ==============================================================================

import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { loadAppConfig } from '@aethra/config';

const { Pool } = pg;
const config = loadAppConfig('identity-service', 3001);

export interface DatabaseSchema {
  users: {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    email_status: string;
    phone_status: string;
    status: string;
    created_at: Date;
    updated_at: Date;
  };
}

export function createDatabaseClient(databaseName: string = 'identity_db'): Kysely<DatabaseSchema> {
  const pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: databaseName,
    user: config.database.user,
    password: config.database.password,
    min: config.database.poolMin,
    max: config.database.poolMax,
    ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
  });

  return new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({ pool }),
  });
}
