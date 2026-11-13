// ==============================================================================
// AETHRA Identity Service — Application Logic & Transactional Outbox
// ==============================================================================

import crypto from 'node:crypto';
import { Kysely } from 'kysely';
import { IdentityDatabaseSchema } from '../database/connection.js';
import { IdentityProviderAdapter } from '../infrastructure/oidc-provider.adapter.js';
import { KafkaTopics, createEventEnvelope, UserRegisteredEventPayload } from '@aethra/event-contracts';
import { createStructuredLogger } from '@aethra/observability';

const logger = createStructuredLogger('identity-service');

export interface RegisterUserCommand {
  email: string;
  fullName: string;
  phone?: string;
  correlationId: string;
}

export interface RegisterUserResult {
  userId: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: string;
  createdAt: string;
}

export class IdentityApplicationService {
  constructor(
    private readonly db: Kysely<IdentityDatabaseSchema>,
    private readonly idp: IdentityProviderAdapter,
  ) {}

  /**
   * Register a new user:
   * 1. Register with OIDC provider
   * 2. Insert into users and user_auth_providers tables
   * 3. Insert transactional outbox event for Kafka dispatch
   */
  async registerUser(cmd: RegisterUserCommand): Promise<RegisterUserResult> {
    const existing = await this.db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', cmd.email.toLowerCase().trim())
      .executeTakeFirst();

    if (existing) {
      throw new Error(`CONFLICT: User with email ${cmd.email} already exists`);
    }

    // 1. Call OIDC provider
    const idpResult = await this.idp.createUser(cmd.email, cmd.fullName, cmd.phone);

    // 2. Atomic database transaction (User + Auth Provider + Outbox Event)
    const result = await this.db.transaction().execute(async (trx) => {
      const user = await trx
        .insertInto('users')
        .values({
          id: crypto.randomUUID(),
          full_name: cmd.fullName.trim(),
          email: cmd.email.toLowerCase().trim(),
          phone: cmd.phone ? cmd.phone.trim() : null,
          email_status: idpResult.emailVerified ? 'verified' : 'unverified',
          phone_status: idpResult.phoneVerified ? 'verified' : 'unverified',
          status: 'active',
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx
        .insertInto('user_auth_providers')
        .values({
          id: crypto.randomUUID(),
          user_id: user.id,
          provider_type: idpResult.providerType,
          provider_subject: idpResult.providerSubject,
          provider_issuer: idpResult.providerIssuer,
          linked_at: new Date(),
        })
        .execute();

      // 3. Transactional Outbox Event
      const eventPayload: UserRegisteredEventPayload = {
        userId: user.id,
        email: user.email,
        fullName: user.full_name,
        phone: user.phone || undefined,
        registeredAt: user.created_at.toISOString(),
      };

      const envelope = createEventEnvelope(
        KafkaTopics.IDENTITY_USER_REGISTERED,
        'aethra-identity-service',
        {
          organisationId: 'global',
          originatingUserId: user.id,
          correlationId: cmd.correlationId,
        },
        eventPayload,
      );

      await trx
        .insertInto('outbox_events')
        .values({
          id: crypto.randomUUID(),
          event_type: KafkaTopics.IDENTITY_USER_REGISTERED,
          topic: KafkaTopics.IDENTITY_USER_REGISTERED,
          partition_key: user.id,
          payload: envelope as unknown as Record<string, unknown>,
          correlation_id: cmd.correlationId,
          status: 'pending',
          retry_count: 0,
          created_at: new Date(),
        })
        .execute();

      return user;
    });

    logger.info({ userId: result.id, email: result.email }, 'User registered successfully with outbox event');

    return {
      userId: result.id,
      email: result.email,
      fullName: result.full_name,
      phone: result.phone,
      status: result.status,
      createdAt: result.created_at.toISOString(),
    };
  }

  /**
   * Create an authenticated session record
   */
  async createSession(userId: string, ipAddress?: string, userAgent?: string): Promise<string> {
    const sessionToken = crypto.randomUUID();
    const sessionTokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000); // 30 days

    await this.db
      .insertInto('user_sessions')
      .values({
        id: crypto.randomUUID(),
        user_id: userId,
        session_token_hash: sessionTokenHash,
        ip_address: ipAddress || null,
        user_agent: userAgent || null,
        is_revoked: false,
        created_at: new Date(),
        expires_at: expiresAt,
        last_active_at: new Date(),
      })
      .execute();

    return sessionToken;
  }

  /**
   * Revoke an active session (Session logout / security revocation)
   */
  async revokeSession(sessionToken: string): Promise<boolean> {
    const sessionTokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
    const updated = await this.db
      .updateTable('user_sessions')
      .set({ is_revoked: true })
      .where('session_token_hash', '=', sessionTokenHash)
      .executeTakeFirst();

    return Number(updated.numUpdatedRows) > 0;
  }

  /**
   * Fetch user by email or ID
   */
  async getUserById(userId: string) {
    return this.db.selectFrom('users').selectAll().where('id', '=', userId).executeTakeFirst();
  }
}
