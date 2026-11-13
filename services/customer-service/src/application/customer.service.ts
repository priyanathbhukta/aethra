// ==============================================================================
// AETHRA Customer Service — Application Domain Service
// ==============================================================================

import crypto from 'node:crypto';
import { Kysely } from 'kysely';
import { CustomerDatabaseSchema } from '../database/connection.js';
import {
  KafkaTopics,
  createEventEnvelope,
  CustomerCreatedEventPayload,
} from '@aethra/event-contracts';
import { createStructuredLogger } from '@aethra/observability';
import {
  CreateCustomerDto,
  CreateCustomerPropertyDto,
  CreatePropertyInstallationDto,
} from '@aethra/api-contracts';

const logger = createStructuredLogger('customer-service');

export interface CreateCustomerCommand extends CreateCustomerDto {
  correlationId: string;
}

export interface LinkCustomerUserCommand {
  customerId: string;
  userId: string;
  customerRole?: 'owner' | 'manager' | 'viewer' | 'family_member';
}

export interface AddPropertyCommand {
  customerId: string;
  property: CreateCustomerPropertyDto;
}

export interface AddInstallationCommand {
  propertyId: string;
  installation: CreatePropertyInstallationDto;
}

export interface DelegatePropertyAccessCommand {
  propertyId: string;
  customerId: string;
  userId: string;
  accessLevel?: 'read_only' | 'manage_maintenance' | 'full_property_admin';
  validUntil?: Date;
}

export class CustomerApplicationService {
  constructor(private readonly db: Kysely<CustomerDatabaseSchema>) {}

  /**
   * Registers a new customer account, profile, and initial primary contact.
   * Emits customer.created.v1 transactional outbox event.
   */
  async createCustomer(cmd: CreateCustomerCommand) {
    const customerId = crypto.randomUUID();
    const profileId = crypto.randomUUID();
    const contactId = crypto.randomUUID();
    const now = new Date();

    const result = await this.db.transaction().execute(async (trx) => {
      // 1. Account Master
      const account = await trx
        .insertInto('customer_accounts')
        .values({
          id: customerId,
          account_type: cmd.accountType || 'individual',
          legal_name: cmd.legalName.trim(),
          display_name: cmd.displayName ? cmd.displayName.trim() : cmd.legalName.trim(),
          pan_tax_id: cmd.panTaxId ? cmd.panTaxId.toUpperCase().trim() : null,
          gst_number: cmd.gstNumber ? cmd.gstNumber.toUpperCase().trim() : null,
          status: 'active',
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // 2. Profile
      const profile = await trx
        .insertInto('customer_profiles')
        .values({
          id: profileId,
          customer_id: customerId,
          primary_email: cmd.primaryEmail.toLowerCase().trim(),
          primary_phone: cmd.primaryPhone.trim(),
          alternate_phone: cmd.alternatePhone ? cmd.alternatePhone.trim() : null,
          language_preference: cmd.languagePreference || 'en',
          avatar_url: null,
          metadata: null,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // 3. Primary Contact
      await trx
        .insertInto('customer_contacts')
        .values({
          id: contactId,
          customer_id: customerId,
          contact_name: cmd.legalName.trim(),
          role_designation: 'Primary Account Owner',
          email: cmd.primaryEmail.toLowerCase().trim(),
          phone: cmd.primaryPhone.trim(),
          is_primary: true,
          created_at: now,
        })
        .execute();

      // 4. Outbox Event (Customer Created)
      const outboxPayload: CustomerCreatedEventPayload = {
        customerId,
        accountType: account.account_type,
        legalName: account.legal_name,
        displayName: account.display_name,
        primaryEmail: profile.primary_email,
        primaryPhone: profile.primary_phone,
        status: account.status,
        createdAt: now.toISOString(),
      };

      const outboxEnvelope = createEventEnvelope(
        KafkaTopics.CUSTOMER_CREATED,
        'aethra-customer-service',
        {
          organisationId: 'global',
          originatingUserId: customerId,
          correlationId: cmd.correlationId,
        },
        outboxPayload
      );

      await trx
        .insertInto('outbox_events')
        .values({
          id: crypto.randomUUID(),
          event_type: outboxEnvelope.eventType,
          topic: KafkaTopics.CUSTOMER_CREATED,
          partition_key: customerId,
          payload: outboxEnvelope as unknown as Record<string, unknown>,
          correlation_id: cmd.correlationId,
          status: 'pending',
          retry_count: 0,
          created_at: now,
        })
        .execute();

      return { account, profile };
    });

    logger.info({ customerId: result.account.id, legalName: result.account.legal_name }, 'Customer account created');
    return result;
  }

  /**
   * Links a platform identity user to a customer account for portal login access.
   */
  async linkCustomerUser(cmd: LinkCustomerUserCommand) {
    const linkId = crypto.randomUUID();
    const result = await this.db
      .insertInto('customer_users')
      .values({
        id: linkId,
        customer_id: cmd.customerId,
        user_id: cmd.userId,
        customer_role: cmd.customerRole || 'owner',
        is_active: true,
        linked_at: new Date(),
      })
      .onConflict((oc) =>
        oc.columns(['customer_id', 'user_id']).doUpdateSet({
          customer_role: cmd.customerRole || 'owner',
          is_active: true,
        })
      )
      .returningAll()
      .executeTakeFirstOrThrow();

    logger.info({ customerId: cmd.customerId, userId: cmd.userId, role: result.customer_role }, 'Linked user to customer account');
    return result;
  }

  /**
   * Registers a customer property (e.g. residential rooftop, commercial factory site).
   */
  async addProperty(cmd: AddPropertyCommand) {
    const propertyId = crypto.randomUUID();
    const now = new Date();

    const property = await this.db
      .insertInto('customer_properties')
      .values({
        id: propertyId,
        customer_id: cmd.customerId,
        property_name: cmd.property.propertyName.trim(),
        property_type: cmd.property.propertyType,
        address_line1: cmd.property.addressLine1.trim(),
        address_line2: cmd.property.addressLine2 ? cmd.property.addressLine2.trim() : null,
        city: cmd.property.city.trim(),
        state: cmd.property.state.trim(),
        postal_code: cmd.property.postalCode.trim(),
        country: cmd.property.country || 'IN',
        latitude: cmd.property.latitude || null,
        longitude: cmd.property.longitude || null,
        discom_name: cmd.property.discomName ? cmd.property.discomName.trim() : null,
        consumer_number: cmd.property.consumerNumber ? cmd.property.consumerNumber.trim() : null,
        sanctioned_load_kw: cmd.property.sanctionedLoadKw || null,
        tariff_rate: cmd.property.tariffRate || null,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    logger.info({ propertyId: property.id, customerId: cmd.customerId, name: property.property_name }, 'Customer property registered');
    return property;
  }

  /**
   * Registers a renewable energy installation (e.g. 10kW Solar Rooftop, 15kWh BESS) under a property.
   */
  async addInstallation(cmd: AddInstallationCommand) {
    const installationId = crypto.randomUUID();
    const now = new Date();

    const installation = await this.db
      .insertInto('property_installations')
      .values({
        id: installationId,
        property_id: cmd.propertyId,
        installation_name: cmd.installation.installationName.trim(),
        system_type: cmd.installation.systemType,
        grid_type: cmd.installation.gridType || 'on_grid',
        capacity_kw: cmd.installation.capacityKw,
        status: 'planned',
        commissioned_date: null,
        commissioning_certificate_doc_id: null,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    logger.info(
      { installationId: installation.id, propertyId: cmd.propertyId, capacityKw: installation.capacity_kw },
      'Property installation created'
    );
    return installation;
  }

  /**
   * Retrieves complete customer details including profile, contacts, properties, and installations.
   */
  async getCustomerDetails(customerId: string) {
    const account = await this.db
      .selectFrom('customer_accounts')
      .selectAll()
      .where('id', '=', customerId)
      .executeTakeFirst();

    if (!account) return null;

    const profile = await this.db
      .selectFrom('customer_profiles')
      .selectAll()
      .where('customer_id', '=', customerId)
      .executeTakeFirst();

    const contacts = await this.db
      .selectFrom('customer_contacts')
      .selectAll()
      .where('customer_id', '=', customerId)
      .execute();

    const properties = await this.getCustomerProperties(customerId);

    return {
      account,
      profile,
      contacts,
      properties,
    };
  }

  /**
   * Lists all properties and nested installations for a customer.
   */
  async getCustomerProperties(customerId: string) {
    const properties = await this.db
      .selectFrom('customer_properties')
      .selectAll()
      .where('customer_id', '=', customerId)
      .orderBy('created_at', 'desc')
      .execute();

    if (properties.length === 0) return [];

    const propertyIds = properties.map((p) => p.id);
    const installations = await this.db
      .selectFrom('property_installations')
      .selectAll()
      .where('property_id', 'in', propertyIds)
      .execute();

    return properties.map((prop) => ({
      ...prop,
      installations: installations.filter((inst) => inst.property_id === prop.id),
    }));
  }

  /**
   * Delegates access to a property for family members, tenants, or plant caretakers.
   */
  async delegatePropertyAccess(cmd: DelegatePropertyAccessCommand) {
    const delegationId = crypto.randomUUID();
    const result = await this.db
      .insertInto('property_access_delegations')
      .values({
        id: delegationId,
        property_id: cmd.propertyId,
        customer_id: cmd.customerId,
        user_id: cmd.userId,
        access_level: cmd.accessLevel || 'read_only',
        valid_until: cmd.validUntil || null,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    logger.info(
      { delegationId, propertyId: cmd.propertyId, userId: cmd.userId, accessLevel: result.access_level },
      'Delegated property access granted'
    );
    return result;
  }
}
