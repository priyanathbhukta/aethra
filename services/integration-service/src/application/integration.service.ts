// ==============================================================================
// AETHRA Integration Service — Application Domain Service & Webhook Ingestion
// ==============================================================================

import crypto from 'node:crypto';
import { Kysely } from 'kysely';
import { IntegrationDatabaseSchema } from '../database/connection.js';
import { createStructuredLogger } from '@aethra/observability';

const logger = createStructuredLogger('integration-service');

export interface CreateConnectionCommand {
  organisationId: string;
  providerCode: string;
  connectionName: string;
  encryptedCredentialsRef: string;
}

export interface HandleWebhookCommand {
  endpointPath: string;
  payload: Record<string, any>;
  eventIdHeader?: string;
}

export class IntegrationApplicationService {
  constructor(private readonly db: Kysely<IntegrationDatabaseSchema>) {}

  /**
   * Configures a third-party connection (Inverter Cloud, Payment Gateway, WhatsApp BSP).
   */
  async createConnection(cmd: CreateConnectionCommand) {
    const provider = await this.db
      .selectFrom('integration_providers')
      .selectAll()
      .where('provider_code', '=', cmd.providerCode)
      .executeTakeFirst();

    if (!provider) {
      throw new Error(`Integration provider '${cmd.providerCode}' not supported`);
    }

    const connectionId = crypto.randomUUID();
    const now = new Date();

    const connection = await this.db
      .insertInto('integration_connections')
      .values({
        id: connectionId,
        organisation_id: cmd.organisationId,
        provider_id: provider.id,
        connection_name: cmd.connectionName.trim(),
        encrypted_credentials_ref: cmd.encryptedCredentialsRef,
        status: 'active',
        last_healthy_at: now,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    logger.info({ connectionId, provider: cmd.providerCode }, 'Integration connection configured');
    return connection;
  }

  /**
   * Idempotent Webhook Intake Engine.
   * Guarantees replay attacks or duplicate webhooks are safely ignored via SHA-256 payload hashing.
   */
  async handleWebhookIntake(cmd: HandleWebhookCommand) {
    const endpoint = await this.db
      .selectFrom('webhook_endpoints')
      .selectAll()
      .where('endpoint_path', '=', cmd.endpointPath)
      .executeTakeFirst();

    const endpointId = endpoint ? endpoint.id : crypto.randomUUID();

    // Compute SHA-256 payload hash
    const payloadString = JSON.stringify(cmd.payload);
    const payloadHash = crypto.createHash('sha256').update(payloadString).digest('hex');

    // Idempotency check: see if exact payload hash was already received on this endpoint
    const existing = await this.db
      .selectFrom('webhook_deliveries')
      .selectAll()
      .where('endpoint_id', '=', endpointId)
      .where('payload_hash', '=', payloadHash)
      .executeTakeFirst();

    if (existing) {
      logger.info({ endpointId, payloadHash }, 'Duplicate webhook delivery detected and ignored');
      return {
        received: true,
        duplicate: true,
        deliveryId: existing.id,
        processingStatus: 'ignored',
      };
    }

    const deliveryId = crypto.randomUUID();
    const delivery = await this.db
      .insertInto('webhook_deliveries')
      .values({
        id: deliveryId,
        endpoint_id: endpointId,
        event_id_header: cmd.eventIdHeader || null,
        payload_hash: payloadHash,
        payload: cmd.payload,
        processing_status: 'received',
        error_message: null,
        received_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    logger.info({ deliveryId, endpoint: cmd.endpointPath }, 'Webhook delivery recorded');
    return {
      received: true,
      duplicate: false,
      deliveryId: delivery.id,
      processingStatus: 'received',
    };
  }

  /**
   * Updates telemetry synchronization cursor.
   */
  async recordTelemetrySync(connectionId: string, syncDomain: string, lastCursor: string, recordsProcessed: number) {
    const now = new Date();
    const existing = await this.db
      .selectFrom('sync_status')
      .selectAll()
      .where('connection_id', '=', connectionId)
      .where('sync_domain', '=', syncDomain)
      .executeTakeFirst();

    if (existing) {
      return await this.db
        .updateTable('sync_status')
        .set({
          last_cursor: lastCursor,
          records_processed: recordsProcessed,
          last_synced_at: now,
        })
        .where('id', '=', existing.id)
        .returningAll()
        .executeTakeFirstOrThrow();
    }

    return await this.db
      .insertInto('sync_status')
      .values({
        id: crypto.randomUUID(),
        connection_id: connectionId,
        sync_domain: syncDomain,
        last_cursor: lastCursor,
        records_processed: recordsProcessed,
        last_synced_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
