#!/bin/bash
set -e
set -u

# ==============================================================================
# AETHRA — Local PostgreSQL Multi-Database & User Provisioning Script
# ==============================================================================

DATABASES=(
  "identity_db"
  "organisation_db"
  "access_control_db"
  "subscription_db"
  "customer_db"
  "vendor_relationship_db"
  "crm_db"
  "catalogue_db"
  "quotation_db"
  "engineering_db"
  "inventory_db"
  "procurement_db"
  "project_db"
  "document_db"
  "notification_db"
  "service_db"
  "reporting_db"
  "integration_db"
  "audit_db"
)

echo "Provisioning 19 AETHRA microservice databases..."

for db in "${DATABASES[@]}"; do
  echo "Creating database and user for: $db"
  user="aethra_${db%_db}_user"
  password="password_${db%_db}"

  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$user') THEN
        CREATE USER $user WITH PASSWORD '$password';
      END IF;
    END
    \$\$;

    SELECT 'CREATE DATABASE $db OWNER $user'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\gexec

    GRANT ALL PRIVILEGES ON DATABASE $db TO $user;
EOSQL

  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    GRANT ALL ON SCHEMA public TO $user;
EOSQL
done

echo "All 19 AETHRA microservice databases provisioned successfully!"
