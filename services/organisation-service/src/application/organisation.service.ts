// ==============================================================================
// AETHRA Organisation Service — Application Logic & Tenant Management
// ==============================================================================

import crypto from 'node:crypto';
import { Kysely } from 'kysely';
import { OrganisationDatabaseSchema, withTenantContext } from '../database/connection.js';
import { KafkaTopics, createEventEnvelope, OrganisationCreatedEventPayload } from '@aethra/event-contracts';
import { createStructuredLogger } from '@aethra/observability';

const logger = createStructuredLogger('organisation-service');

export interface CreateOrganisationCommand {
  legalName: string;
  tradeName?: string;
  ownerUserId: string;
  businessCategories: string[];
  supportEmail: string;
  supportPhone: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  correlationId: string;
}

export interface CreateBranchCommand {
  organisationId: string;
  branchCode: string;
  name: string;
  isHeadquarters?: boolean;
  address: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface CreateWarehouseCommand {
  organisationId: string;
  branchId?: string;
  warehouseCode: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface InviteEmployeeCommand {
  organisationId: string;
  invitedByUserId: string;
  email: string;
  phone?: string;
  roleHints: string[];
  correlationId: string;
}

export class OrganisationApplicationService {
  constructor(private readonly db: Kysely<OrganisationDatabaseSchema>) {}

  /**
   * Onboard a new vendor organisation:
   * 1. Insert into organisations
   * 2. Insert into organisation_profiles
   * 3. Insert default organisation_configurations
   * 4. Insert initial owner membership
   * 5. Emit organisation.created.v1 outbox event
   */
  async createOrganisation(cmd: CreateOrganisationCommand) {
    const result = await this.db.transaction().execute(async (trx) => {
      // 1. Create organisation master record
      const org = await trx
        .insertInto('organisations')
        .values({
          id: crypto.randomUUID(),
          legal_name: cmd.legalName.trim(),
          trade_name: cmd.tradeName ? cmd.tradeName.trim() : null,
          status: 'trial',
          verification_status: 'pending',
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // 2. Create profile
      await trx
        .insertInto('organisation_profiles')
        .values({
          id: crypto.randomUUID(),
          organisation_id: org.id,
          support_email: cmd.supportEmail.toLowerCase().trim(),
          support_phone: cmd.supportPhone.trim(),
          address_line1: cmd.addressLine1.trim(),
          city: cmd.city.trim(),
          state: cmd.state.trim(),
          postal_code: cmd.postalCode.trim(),
          country: 'IN',
          created_at: new Date(),
          updated_at: new Date(),
        })
        .execute();

      // 3. Create default configuration
      await trx
        .insertInto('organisation_configurations')
        .values({
          id: crypto.randomUUID(),
          organisation_id: org.id,
          default_currency: 'INR',
          timezone: 'Asia/Kolkata',
          allow_negative_stock: false,
          quotation_validity_days: 30,
          updated_at: new Date(),
        })
        .execute();

      // 4. Create owner membership
      await trx
        .insertInto('organisation_memberships')
        .values({
          id: crypto.randomUUID(),
          organisation_id: org.id,
          user_id: cmd.ownerUserId,
          membership_status: 'active',
          joined_at: new Date(),
          created_at: new Date(),
        })
        .execute();

      // 5. Transactional outbox event
      const eventPayload: OrganisationCreatedEventPayload = {
        organisationId: org.id,
        legalName: org.legal_name,
        tradeName: org.trade_name || undefined,
        ownerUserId: cmd.ownerUserId,
        businessCategories: cmd.businessCategories,
        createdAt: org.created_at.toISOString(),
      };

      const envelope = createEventEnvelope(
        KafkaTopics.ORGANISATION_CREATED,
        'aethra-organisation-service',
        {
          organisationId: org.id,
          originatingUserId: cmd.ownerUserId,
          correlationId: cmd.correlationId,
        },
        eventPayload,
      );

      await trx
        .insertInto('outbox_events')
        .values({
          id: crypto.randomUUID(),
          event_type: KafkaTopics.ORGANISATION_CREATED,
          topic: KafkaTopics.ORGANISATION_CREATED,
          partition_key: org.id,
          payload: envelope as unknown as Record<string, unknown>,
          correlation_id: cmd.correlationId,
          status: 'pending',
          retry_count: 0,
          created_at: new Date(),
        })
        .execute();

      return org;
    });

    logger.info({ orgId: result.id, legalName: result.legal_name }, 'Vendor organisation onboarded successfully');
    return result;
  }

  /**
   * Create a branch within an isolated tenant boundary
   */
  async createBranch(cmd: CreateBranchCommand) {
    return withTenantContext(this.db, cmd.organisationId, async (trx) => {
      const branch = await trx
        .insertInto('branches')
        .values({
          id: crypto.randomUUID(),
          organisation_id: cmd.organisationId,
          branch_code: cmd.branchCode.toUpperCase().trim(),
          name: cmd.name.trim(),
          is_headquarters: cmd.isHeadquarters || false,
          address: cmd.address.trim(),
          city: cmd.city.trim(),
          state: cmd.state.trim(),
          postal_code: cmd.postalCode.trim(),
          is_active: true,
          created_at: new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      logger.info({ branchId: branch.id, branchCode: branch.branch_code }, 'Branch created in tenant');
      return branch;
    });
  }

  /**
   * Create a warehouse within an isolated tenant boundary
   */
  async createWarehouse(cmd: CreateWarehouseCommand) {
    return withTenantContext(this.db, cmd.organisationId, async (trx) => {
      const warehouse = await trx
        .insertInto('warehouses')
        .values({
          id: crypto.randomUUID(),
          organisation_id: cmd.organisationId,
          branch_id: cmd.branchId || null,
          warehouse_code: cmd.warehouseCode.toUpperCase().trim(),
          name: cmd.name.trim(),
          address: cmd.address.trim(),
          city: cmd.city.trim(),
          state: cmd.state.trim(),
          postal_code: cmd.postalCode.trim(),
          is_active: true,
          created_at: new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      logger.info({ warehouseId: warehouse.id, warehouseCode: warehouse.warehouse_code }, 'Warehouse created in tenant');
      return warehouse;
    });
  }

  /**
   * Invite an employee to the vendor organisation
   */
  async inviteEmployee(cmd: InviteEmployeeCommand) {
    return withTenantContext(this.db, cmd.organisationId, async (trx) => {
      const rawToken = crypto.randomUUID();
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000); // 7 days

      const invitation = await trx
        .insertInto('membership_invitations')
        .values({
          id: crypto.randomUUID(),
          organisation_id: cmd.organisationId,
          email: cmd.email.toLowerCase().trim(),
          phone: cmd.phone ? cmd.phone.trim() : null,
          invited_by_user_id: cmd.invitedByUserId,
          invitation_token_hash: tokenHash,
          role_hints: { roles: cmd.roleHints },
          status: 'pending',
          expires_at: expiresAt,
          created_at: new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      logger.info({ invitationId: invitation.id, email: cmd.email }, 'Employee invitation created in tenant');

      return {
        invitation,
        rawToken, // Sent to user via notification service
      };
    });
  }

  /**
   * List all organisation memberships for a given user (supports multi-organisation participation)
   */
  async getUserMemberships(userId: string) {
    return this.db
      .selectFrom('organisation_memberships as m')
      .innerJoin('organisations as o', 'o.id', 'm.organisation_id')
      .select([
        'o.id as organisationId',
        'o.legal_name as legalName',
        'o.trade_name as tradeName',
        'o.status as organisationStatus',
        'm.membership_status as membershipStatus',
        'm.joined_at as joinedAt',
      ])
      .where('m.user_id', '=', userId)
      .where('m.membership_status', '=', 'active')
      .execute();
  }
}
