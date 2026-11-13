// ==============================================================================
// AETHRA Vendor Relationship Service — Application Domain Service
// ==============================================================================

import crypto from 'node:crypto';
import { Kysely } from 'kysely';
import { VendorRelationshipDatabaseSchema } from '../database/connection.js';
import {
  KafkaTopics,
  createEventEnvelope,
  VendorRelationshipCreatedEventPayload,
  VendorRelationshipActivatedEventPayload,
  VendorRelationshipRevokedEventPayload,
} from '@aethra/event-contracts';
import { createStructuredLogger } from '@aethra/observability';

const logger = createStructuredLogger('vendor-relationship-service');

export interface InitiateRelationshipCommand {
  organisationId: string;
  customerId: string;
  purposeCode: string;
  metadata?: Record<string, unknown>;
  correlationId: string;
}

export interface AcceptConsentCommand {
  relationshipId: string;
  userId: string;
  consentVersion: string;
  consentMethod?: 'digital_signature' | 'otp_confirmation' | 'contract_upload';
  ipAddress: string;
  userAgent: string;
  correlationId: string;
}

export interface GrantPropertyAccessCommand {
  relationshipId: string;
  propertyId: string;
  accessScope?: 'read_only' | 'read_write' | 'engineering_only';
}

export interface GrantInstallationAccessCommand {
  propertyGrantId: string;
  installationId: string;
  accessScope?: 'operational_read' | 'telemetry_read' | 'service_write';
}

export interface RevokeRelationshipCommand {
  relationshipId: string;
  revocationReason: string;
  revokedByUserId: string;
  revokedByRole?: 'customer_owner' | 'vendor_owner' | 'platform_admin' | 'system_auto';
  propertyId?: string;
  installationId?: string;
  correlationId: string;
}

export interface ValidateAccessQuery {
  organisationId: string;
  customerId: string;
  propertyId?: string;
}

export class VendorRelationshipApplicationService {
  constructor(private readonly db: Kysely<VendorRelationshipDatabaseSchema>) {}

  /**
   * Initiates a new relationship request between a vendor and a customer.
   * State starts as 'pending' until customer explicitly consents.
   */
  async initiateRelationship(cmd: InitiateRelationshipCommand) {
    const purpose = await this.db
      .selectFrom('relationship_purposes')
      .selectAll()
      .where('code', '=', cmd.purposeCode)
      .executeTakeFirst();

    if (!purpose) {
      throw new Error(`Invalid relationship purpose code: ${cmd.purposeCode}`);
    }

    const relationshipId = crypto.randomUUID();
    const now = new Date();

    const relationship = await this.db.transaction().execute(async (trx) => {
      const rel = await trx
        .insertInto('vendor_customer_relationships')
        .values({
          id: relationshipId,
          organisation_id: cmd.organisationId,
          customer_id: cmd.customerId,
          purpose_id: purpose.id,
          status: 'pending',
          initiated_at: now,
          activated_at: null,
          expires_at: null,
          revoked_at: null,
          metadata: cmd.metadata || null,
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Emit vendor_relationship.created.v1 outbox event
      const payload: VendorRelationshipCreatedEventPayload = {
        relationshipId: rel.id,
        organisationId: cmd.organisationId,
        customerId: cmd.customerId,
        purposeCode: cmd.purposeCode,
        status: rel.status,
        initiatedAt: now.toISOString(),
      };

      const envelope = createEventEnvelope(
        KafkaTopics.VENDOR_RELATIONSHIP_CREATED,
        'aethra-vendor-relationship-service',
        {
          organisationId: cmd.organisationId,
          correlationId: cmd.correlationId,
        },
        payload
      );

      await trx
        .insertInto('outbox_events')
        .values({
          id: crypto.randomUUID(),
          event_type: envelope.eventType,
          topic: KafkaTopics.VENDOR_RELATIONSHIP_CREATED,
          partition_key: cmd.organisationId,
          payload: envelope as unknown as Record<string, unknown>,
          correlation_id: cmd.correlationId,
          status: 'pending',
          retry_count: 0,
          created_at: now,
        })
        .execute();

      return rel;
    });

    logger.info(
      { relationshipId: relationship.id, orgId: cmd.organisationId, customerId: cmd.customerId },
      'Vendor-customer relationship initiated (pending consent)'
    );
    return relationship;
  }

  /**
   * Customer accepts terms and signs digital consent.
   * Transitions relationship to 'active' and provisions base vendor access grants.
   */
  async acceptConsentAndActivate(cmd: AcceptConsentCommand) {
    const rel = await this.db
      .selectFrom('vendor_customer_relationships as vcr')
      .innerJoin('relationship_purposes as rp', 'rp.id', 'vcr.purpose_id')
      .select([
        'vcr.id',
        'vcr.organisation_id',
        'vcr.customer_id',
        'vcr.purpose_id',
        'vcr.status',
        'rp.code as purpose_code',
      ])
      .where('vcr.id', '=', cmd.relationshipId)
      .executeTakeFirst();

    if (!rel) {
      throw new Error(`Relationship '${cmd.relationshipId}' not found`);
    }

    if (rel.status !== 'pending') {
      throw new Error(`Relationship cannot be activated from status '${rel.status}'`);
    }

    const consentId = crypto.randomUUID();
    const grantId = crypto.randomUUID();
    const now = new Date();
    const consentTextHash = crypto
      .createHash('sha256')
      .update(`${rel.id}:${cmd.userId}:${cmd.consentVersion}:${now.toISOString()}`)
      .digest('hex');

    const result = await this.db.transaction().execute(async (trx) => {
      // 1. Record immutable digital consent
      await trx
        .insertInto('customer_consents')
        .values({
          id: consentId,
          relationship_id: rel.id,
          customer_id: rel.customer_id,
          user_id: cmd.userId,
          purpose_id: rel.purpose_id,
          consent_version: cmd.consentVersion,
          consent_text_hash: consentTextHash,
          ip_address: cmd.ipAddress,
          user_agent: cmd.userAgent,
          consent_method: cmd.consentMethod || 'digital_signature',
          consented_at: now,
          valid_until: null,
          revoked_at: null,
        })
        .execute();

      // 2. Activate relationship
      const activatedRel = await trx
        .updateTable('vendor_customer_relationships')
        .set({
          status: 'active',
          activated_at: now,
          updated_at: now,
        })
        .where('id', '=', rel.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      // 3. Provision base vendor access grant
      await trx
        .insertInto('vendor_access_grants')
        .values({
          id: grantId,
          relationship_id: rel.id,
          organisation_id: rel.organisation_id,
          customer_id: rel.customer_id,
          grant_type: 'profile_read',
          is_active: true,
          valid_from: now,
          valid_until: null,
          created_at: now,
          revoked_at: null,
        })
        .execute();

      // 4. Outbox Event (Relationship Activated)
      const outboxPayload: VendorRelationshipActivatedEventPayload = {
        relationshipId: rel.id,
        organisationId: rel.organisation_id,
        customerId: rel.customer_id,
        purposeCode: rel.purpose_code,
        status: 'active',
        activatedAt: now.toISOString(),
      };

      const envelope = createEventEnvelope(
        KafkaTopics.VENDOR_RELATIONSHIP_ACTIVATED,
        'aethra-vendor-relationship-service',
        {
          organisationId: rel.organisation_id,
          correlationId: cmd.correlationId,
        },
        outboxPayload
      );

      await trx
        .insertInto('outbox_events')
        .values({
          id: crypto.randomUUID(),
          event_type: envelope.eventType,
          topic: KafkaTopics.VENDOR_RELATIONSHIP_ACTIVATED,
          partition_key: rel.organisation_id,
          payload: envelope as unknown as Record<string, unknown>,
          correlation_id: cmd.correlationId,
          status: 'pending',
          retry_count: 0,
          created_at: now,
        })
        .execute();

      return activatedRel;
    });

    logger.info({ relationshipId: rel.id, customerId: rel.customer_id }, 'Relationship activated via consent');
    return result;
  }

  /**
   * Scopes vendor access to a specific real estate property under an active relationship.
   */
  async grantPropertyAccess(cmd: GrantPropertyAccessCommand) {
    const grant = await this.db
      .selectFrom('vendor_access_grants')
      .selectAll()
      .where('relationship_id', '=', cmd.relationshipId)
      .where('is_active', '=', true)
      .executeTakeFirst();

    if (!grant) {
      throw new Error(`No active vendor access grant found for relationship '${cmd.relationshipId}'`);
    }

    const propGrantId = crypto.randomUUID();
    const result = await this.db
      .insertInto('property_access_grants')
      .values({
        id: propGrantId,
        grant_id: grant.id,
        property_id: cmd.propertyId,
        access_scope: cmd.accessScope || 'read_write',
        is_active: true,
        granted_at: new Date(),
        revoked_at: null,
      })
      .onConflict((oc) =>
        oc.columns(['grant_id', 'property_id']).doUpdateSet({
          access_scope: cmd.accessScope || 'read_write',
          is_active: true,
          revoked_at: null,
        })
      )
      .returningAll()
      .executeTakeFirstOrThrow();

    logger.info({ propertyGrantId: result.id, propertyId: cmd.propertyId }, 'Granted vendor property access');
    return result;
  }

  /**
   * Immediately revokes a relationship or property grant.
   * Records immutable revocation reason in audit journal and dispatches vendor_relationship.revoked.v1 outbox event.
   */
  async revokeRelationship(cmd: RevokeRelationshipCommand) {
    const rel = await this.db
      .selectFrom('vendor_customer_relationships')
      .selectAll()
      .where('id', '=', cmd.relationshipId)
      .executeTakeFirst();

    if (!rel) {
      throw new Error(`Relationship '${cmd.relationshipId}' not found`);
    }

    const now = new Date();
    const revocationId = crypto.randomUUID();

    await this.db.transaction().execute(async (trx) => {
      // 1. Audit revocation history
      await trx
        .insertInto('access_revocation_history')
        .values({
          id: revocationId,
          relationship_id: rel.id,
          organisation_id: rel.organisation_id,
          customer_id: rel.customer_id,
          target_type: 'relationship',
          target_id: rel.id,
          revoked_by_role: cmd.revokedByRole || 'customer_owner',
          revoked_by_user_id: cmd.revokedByUserId,
          revocation_reason: cmd.revocationReason,
          revoked_at: now,
        })
        .execute();

      // 2. Mark relationship revoked
      await trx
        .updateTable('vendor_customer_relationships')
        .set({
          status: 'revoked',
          revoked_at: now,
          updated_at: now,
        })
        .where('id', '=', rel.id)
        .execute();

      // 3. Invalidate all vendor access grants
      await trx
        .updateTable('vendor_access_grants')
        .set({
          is_active: false,
          revoked_at: now,
        })
        .where('relationship_id', '=', rel.id)
        .execute();

      // 4. Outbox Event (Relationship Revoked)
      const outboxPayload: VendorRelationshipRevokedEventPayload = {
        relationshipId: rel.id,
        organisationId: rel.organisation_id,
        customerId: rel.customer_id,
        propertyId: cmd.propertyId,
        installationId: cmd.installationId,
        revocationReason: cmd.revocationReason,
        revokedByUserId: cmd.revokedByUserId,
        revokedAt: now.toISOString(),
      };

      const envelope = createEventEnvelope(
        KafkaTopics.VENDOR_RELATIONSHIP_REVOKED,
        'aethra-vendor-relationship-service',
        {
          organisationId: rel.organisation_id,
          correlationId: cmd.correlationId,
        },
        outboxPayload
      );

      await trx
        .insertInto('outbox_events')
        .values({
          id: crypto.randomUUID(),
          event_type: envelope.eventType,
          topic: KafkaTopics.VENDOR_RELATIONSHIP_REVOKED,
          partition_key: rel.organisation_id,
          payload: envelope as unknown as Record<string, unknown>,
          correlation_id: cmd.correlationId,
          status: 'pending',
          retry_count: 0,
          created_at: now,
        })
        .execute();
    });

    logger.warn(
      { relationshipId: rel.id, orgId: rel.organisation_id, reason: cmd.revocationReason },
      'Vendor-customer relationship revoked and invalidation event dispatched'
    );
  }

  /**
   * Authorisation security check: Verifies if a vendor has active, non-revoked access to a customer and property.
   */
  async validateVendorAccess(query: ValidateAccessQuery): Promise<{
    isAuthorized: boolean;
    relationshipStatus?: string;
    propertyScope?: string;
    reason?: string;
  }> {
    const rel = await this.db
      .selectFrom('vendor_customer_relationships')
      .selectAll()
      .where('organisation_id', '=', query.organisationId)
      .where('customer_id', '=', query.customerId)
      .where('status', '=', 'active')
      .executeTakeFirst();

    if (!rel) {
      return {
        isAuthorized: false,
        reason: 'No active relationship between vendor and customer',
      };
    }

    if (!query.propertyId) {
      return {
        isAuthorized: true,
        relationshipStatus: rel.status,
      };
    }

    // Property-level scoping
    const propGrant = await this.db
      .selectFrom('property_access_grants as pag')
      .innerJoin('vendor_access_grants as vag', 'vag.id', 'pag.grant_id')
      .select(['pag.access_scope', 'pag.is_active'])
      .where('vag.organisation_id', '=', query.organisationId)
      .where('vag.customer_id', '=', query.customerId)
      .where('pag.property_id', '=', query.propertyId)
      .where('pag.is_active', '=', true)
      .executeTakeFirst();

    if (!propGrant) {
      return {
        isAuthorized: false,
        relationshipStatus: rel.status,
        reason: 'Vendor has active customer relationship but lacks access grant to this property',
      };
    }

    return {
      isAuthorized: true,
      relationshipStatus: rel.status,
      propertyScope: propGrant.access_scope,
    };
  }

  /**
   * Retrieves all customer relationships for a vendor organisation.
   */
  async getVendorRelationships(organisationId: string) {
    return this.db
      .selectFrom('vendor_customer_relationships as vcr')
      .innerJoin('relationship_purposes as rp', 'rp.id', 'vcr.purpose_id')
      .selectAll('vcr')
      .select(['rp.code as purpose_code', 'rp.display_name as purpose_name'])
      .where('vcr.organisation_id', '=', organisationId)
      .orderBy('vcr.created_at', 'desc')
      .execute();
  }

  /**
   * Retrieves all vendor relationships for a customer account.
   */
  async getCustomerRelationships(customerId: string) {
    return this.db
      .selectFrom('vendor_customer_relationships as vcr')
      .innerJoin('relationship_purposes as rp', 'rp.id', 'vcr.purpose_id')
      .selectAll('vcr')
      .select(['rp.code as purpose_code', 'rp.display_name as purpose_name'])
      .where('vcr.customer_id', '=', customerId)
      .orderBy('vcr.created_at', 'desc')
      .execute();
  }
}
