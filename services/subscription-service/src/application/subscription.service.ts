// ==============================================================================
// AETHRA Subscription & Entitlement Service — Application Domain Service
// ==============================================================================

import { Kysely } from 'kysely';
import { SubscriptionDatabaseSchema } from '../database/connection.js';
import {
  KafkaTopics,
  createEventEnvelope,
  SubscriptionActivatedEventPayload,
  SubscriptionSuspendedEventPayload,
  SubscriptionLimitReachedEventPayload,
} from '@aethra/event-contracts';
import { createStructuredLogger } from '@aethra/observability';

const logger = createStructuredLogger('subscription-service');

export interface EntitlementCheckResult {
  organisationId: string;
  moduleCode: string;
  isEntitled: boolean;
  status: 'active' | 'suspended' | 'inactive' | 'not_subscribed';
  isCore: boolean;
  reason?: string;
}

export interface RecordUsageCommand {
  organisationId: string;
  featureCode: string;
  quantity: number;
  idempotencyKey: string;
  recordedBy?: string;
  correlationId?: string;
}

export interface UsageRecordResult {
  success: boolean;
  organisationId: string;
  featureCode: string;
  currentUsage: number;
  maxAllowed: number;
  remaining: number | 'unlimited';
  reason?: string;
}

export interface ActivateSubscriptionCommand {
  organisationId: string;
  planId: string;
  billingContactEmail?: string;
  paymentMetadata?: Record<string, unknown>;
  correlationId: string;
}

export interface SuspendSubscriptionCommand {
  organisationId: string;
  reason: string;
  correlationId: string;
}

export class SubscriptionApplicationService {
  constructor(private readonly db: Kysely<SubscriptionDatabaseSchema>) {}

  /**
   * Evaluates if a tenant organisation has an active entitlement to a given module.
   * Core platform modules are always entitled to any tenant.
   * Non-core modules require an active subscription and explicit module entitlement.
   */
  async verifyEntitlement(organisationId: string, moduleCode: string): Promise<EntitlementCheckResult> {
    // 1. Fetch Module from Catalogue
    const moduleItem = await this.db
      .selectFrom('module_catalogue')
      .selectAll()
      .where('code', '=', moduleCode)
      .where('is_active', '=', true)
      .executeTakeFirst();

    if (!moduleItem) {
      return {
        organisationId,
        moduleCode,
        isEntitled: false,
        status: 'not_subscribed',
        isCore: false,
        reason: `Module '${moduleCode}' not recognized in active platform catalogue`,
      };
    }

    // Core modules are universally entitled
    if (moduleItem.is_core) {
      return {
        organisationId,
        moduleCode,
        isEntitled: true,
        status: 'active',
        isCore: true,
      };
    }

    // 2. Check Organisation's Active Subscription
    const subscription = await this.db
      .selectFrom('organisation_subscriptions')
      .selectAll()
      .where('organisation_id', '=', organisationId)
      .executeTakeFirst();

    if (!subscription) {
      return {
        organisationId,
        moduleCode,
        isEntitled: false,
        status: 'inactive',
        isCore: false,
        reason: 'Organisation has no registered subscription',
      };
    }

    const validStatuses = ['trial', 'active', 'grace_period'];
    if (!validStatuses.includes(subscription.status)) {
      return {
        organisationId,
        moduleCode,
        isEntitled: false,
        status: subscription.status as 'suspended' | 'inactive',
        isCore: false,
        reason: `Subscription is currently in '${subscription.status}' state`,
      };
    }

    // Check expiration
    const now = new Date();
    if (subscription.current_period_end < now && subscription.status !== 'grace_period') {
      return {
        organisationId,
        moduleCode,
        isEntitled: false,
        status: 'inactive',
        isCore: false,
        reason: 'Subscription period has expired',
      };
    }

    // 3. Verify Active Module Provisioning
    const subModule = await this.db
      .selectFrom('subscription_modules')
      .selectAll()
      .where('organisation_id', '=', organisationId)
      .where('module_id', '=', moduleItem.id)
      .where('status', '=', 'active')
      .executeTakeFirst();

    if (!subModule) {
      return {
        organisationId,
        moduleCode,
        isEntitled: false,
        status: 'not_subscribed',
        isCore: false,
        reason: `Module '${moduleCode}' is not active in current subscription`,
      };
    }

    return {
      organisationId,
      moduleCode,
      isEntitled: true,
      status: 'active',
      isCore: false,
    };
  }

  /**
   * Atomically records usage against a feature quota limit.
   * Enforces idempotency via idempotencyKey.
   * Emits subscription.limit_reached.v1 event if max quota is reached.
   */
  async recordUsage(cmd: RecordUsageCommand): Promise<UsageRecordResult> {
    // 1. Idempotency Check
    const existingUsage = await this.db
      .selectFrom('usage_records')
      .selectAll()
      .where('idempotency_key', '=', cmd.idempotencyKey)
      .executeTakeFirst();

    if (existingUsage) {
      const currentLimit = await this.db
        .selectFrom('entitlement_limits')
        .selectAll()
        .where('organisation_id', '=', cmd.organisationId)
        .where('feature_code', '=', cmd.featureCode)
        .executeTakeFirst();

      const maxAllowed = currentLimit ? Number(currentLimit.max_allowed) : -1;
      const currentUsage = currentLimit ? Number(currentLimit.current_usage) : Number(existingUsage.quantity);

      return {
        success: true,
        organisationId: cmd.organisationId,
        featureCode: cmd.featureCode,
        currentUsage,
        maxAllowed,
        remaining: maxAllowed === -1 ? 'unlimited' : Math.max(0, maxAllowed - currentUsage),
      };
    }

    // 2. Fetch Subscription & Limits
    const subscription = await this.db
      .selectFrom('organisation_subscriptions')
      .selectAll()
      .where('organisation_id', '=', cmd.organisationId)
      .executeTakeFirst();

    if (!subscription) {
      return {
        success: false,
        organisationId: cmd.organisationId,
        featureCode: cmd.featureCode,
        currentUsage: 0,
        maxAllowed: 0,
        remaining: 0,
        reason: 'No active subscription found for organisation',
      };
    }

    const limitRow = await this.db
      .selectFrom('entitlement_limits')
      .selectAll()
      .where('organisation_id', '=', cmd.organisationId)
      .where('feature_code', '=', cmd.featureCode)
      .executeTakeFirst();

    const maxAllowed = limitRow ? Number(limitRow.max_allowed) : -1;
    const currentUsage = limitRow ? Number(limitRow.current_usage) : 0;

    // 3. Quota Boundary Check
    if (maxAllowed !== -1 && currentUsage + cmd.quantity > maxAllowed) {
      logger.warn(
        { orgId: cmd.organisationId, feature: cmd.featureCode, currentUsage, maxAllowed, requested: cmd.quantity },
        'Feature entitlement quota limit exceeded'
      );

      // Record limit reached event in outbox
      const correlationId = cmd.correlationId || crypto.randomUUID();
      const limitReachedPayload: SubscriptionLimitReachedEventPayload = {
        subscriptionId: subscription.id,
        organisationId: cmd.organisationId,
        featureCode: cmd.featureCode,
        maxAllowed,
        currentUsage,
        reachedAt: new Date().toISOString(),
      };

      const outboxEnvelope = createEventEnvelope(
        KafkaTopics.SUBSCRIPTION_LIMIT_REACHED,
        'aethra-subscription-service',
        {
          organisationId: cmd.organisationId,
          correlationId,
        },
        limitReachedPayload,
      );

      await this.db
        .insertInto('outbox_events')
        .values({
          id: crypto.randomUUID(),
          event_type: outboxEnvelope.eventType,
          topic: KafkaTopics.SUBSCRIPTION_LIMIT_REACHED,
          partition_key: cmd.organisationId,
          payload: outboxEnvelope as unknown as Record<string, unknown>,
          correlation_id: correlationId,
          status: 'pending',
          retry_count: 0,
          created_at: new Date(),
        })
        .execute();

      return {
        success: false,
        organisationId: cmd.organisationId,
        featureCode: cmd.featureCode,
        currentUsage,
        maxAllowed,
        remaining: Math.max(0, maxAllowed - currentUsage),
        reason: `Feature quota exceeded. Max: ${maxAllowed}, Used: ${currentUsage}, Requested: ${cmd.quantity}`,
      };
    }

    // 4. Atomic Increment and Usage Ledger
    const newUsage = currentUsage + cmd.quantity;

    await this.db.transaction().execute(async (trx) => {
      if (limitRow) {
        await trx
          .updateTable('entitlement_limits')
          .set({
            current_usage: newUsage,
            updated_at: new Date(),
          })
          .where('id', '=', limitRow.id)
          .execute();
      } else {
        await trx
          .insertInto('entitlement_limits')
          .values({
            id: crypto.randomUUID(),
            organisation_id: cmd.organisationId,
            subscription_id: subscription.id,
            feature_code: cmd.featureCode,
            max_allowed: -1,
            current_usage: newUsage,
            reset_cadence: 'never',
            updated_at: new Date(),
          })
          .execute();
      }

      await trx
        .insertInto('usage_records')
        .values({
          id: crypto.randomUUID(),
          organisation_id: cmd.organisationId,
          subscription_id: subscription.id,
          feature_code: cmd.featureCode,
          quantity: cmd.quantity,
          idempotency_key: cmd.idempotencyKey,
          recorded_by: cmd.recordedBy || null,
          recorded_at: new Date(),
        })
        .execute();
    });

    return {
      success: true,
      organisationId: cmd.organisationId,
      featureCode: cmd.featureCode,
      currentUsage: newUsage,
      maxAllowed,
      remaining: maxAllowed === -1 ? 'unlimited' : Math.max(0, maxAllowed - newUsage),
    };
  }

  /**
   * Activates or upgrades a subscription plan for an organisation.
   * Links plan modules, initialises entitlement limits, and emits subscription.activated.v1 outbox event.
   */
  async activateSubscription(cmd: ActivateSubscriptionCommand): Promise<{
    subscriptionId: string;
    organisationId: string;
    planId: string;
    status: string;
    currentPeriodEnd: Date;
  }> {
    const plan = await this.db
      .selectFrom('subscription_plans')
      .selectAll()
      .where('id', '=', cmd.planId)
      .where('is_active', '=', true)
      .executeTakeFirst();

    if (!plan) {
      throw new Error(`Subscription plan '${cmd.planId}' not found or inactive`);
    }

    const now = new Date();
    const periodDays = plan.billing_cycle === 'annual' ? 365 : plan.billing_cycle === 'quarterly' ? 90 : 30;
    const periodEnd = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000);

    const subscriptionId = crypto.randomUUID();

    await this.db.transaction().execute(async (trx) => {
      // Upsert organisation subscription
      await trx
        .insertInto('organisation_subscriptions')
        .values({
          id: subscriptionId,
          organisation_id: cmd.organisationId,
          plan_id: cmd.planId,
          status: 'active',
          current_period_start: now,
          current_period_end: periodEnd,
          billing_contact_email: cmd.billingContactEmail || null,
          payment_metadata: cmd.paymentMetadata || null,
          created_at: now,
          updated_at: now,
        })
        .onConflict((oc) =>
          oc.column('organisation_id').doUpdateSet({
            plan_id: cmd.planId,
            status: 'active',
            current_period_start: now,
            current_period_end: periodEnd,
            billing_contact_email: cmd.billingContactEmail || null,
            payment_metadata: cmd.paymentMetadata || null,
            updated_at: now,
          })
        )
        .execute();

      // Retrieve actual subscription record id (in case of upsert)
      const sub = await trx
        .selectFrom('organisation_subscriptions')
        .select(['id', 'status'])
        .where('organisation_id', '=', cmd.organisationId)
        .executeTakeFirstOrThrow();

      // Activate all core modules and plan modules
      const coreModules = await trx
        .selectFrom('module_catalogue')
        .select(['id', 'code'])
        .where('is_core', '=', true)
        .execute();

      for (const coreMod of coreModules) {
        await trx
          .insertInto('subscription_modules')
          .values({
            id: crypto.randomUUID(),
            organisation_id: cmd.organisationId,
            subscription_id: sub.id,
            module_id: coreMod.id,
            status: 'active',
            activated_at: now,
          })
          .onConflict((oc) =>
            oc.columns(['subscription_id', 'module_id']).doUpdateSet({
              status: 'active',
            })
          )
          .execute();
      }

      // Add plan-specific modules
      const planMods = await trx
        .selectFrom('plan_modules')
        .select(['module_id'])
        .where('plan_id', '=', cmd.planId)
        .execute();

      for (const pMod of planMods) {
        await trx
          .insertInto('subscription_modules')
          .values({
            id: crypto.randomUUID(),
            organisation_id: cmd.organisationId,
            subscription_id: sub.id,
            module_id: pMod.module_id,
            status: 'active',
            activated_at: now,
          })
          .onConflict((oc) =>
            oc.columns(['subscription_id', 'module_id']).doUpdateSet({
              status: 'active',
            })
          )
          .execute();
      }

      // Outbox Event
      const outboxPayload: SubscriptionActivatedEventPayload = {
        subscriptionId: sub.id,
        organisationId: cmd.organisationId,
        planId: cmd.planId,
        planCode: plan.code,
        status: 'active',
        currentPeriodStart: now.toISOString(),
        currentPeriodEnd: periodEnd.toISOString(),
        activatedAt: now.toISOString(),
      };

      const outboxEnvelope = createEventEnvelope(
        KafkaTopics.SUBSCRIPTION_ACTIVATED,
        'aethra-subscription-service',
        {
          organisationId: cmd.organisationId,
          correlationId: cmd.correlationId,
        },
        outboxPayload,
      );

      await trx
        .insertInto('outbox_events')
        .values({
          id: crypto.randomUUID(),
          event_type: outboxEnvelope.eventType,
          topic: KafkaTopics.SUBSCRIPTION_ACTIVATED,
          partition_key: cmd.organisationId,
          payload: outboxEnvelope as unknown as Record<string, unknown>,
          correlation_id: cmd.correlationId,
          status: 'pending',
          retry_count: 0,
          created_at: now,
        })
        .execute();

      // Subscription lifecycle event record
      await trx
        .insertInto('subscription_events')
        .values({
          id: crypto.randomUUID(),
          organisation_id: cmd.organisationId,
          subscription_id: sub.id,
          event_type: 'subscription_activated',
          from_status: null,
          to_status: 'active',
          payload: { planCode: plan.code, billingCycle: plan.billing_cycle },
          triggered_by: 'system',
          created_at: now,
        })
        .execute();
    });

    return {
      subscriptionId,
      organisationId: cmd.organisationId,
      planId: cmd.planId,
      status: 'active',
      currentPeriodEnd: periodEnd,
    };
  }

  /**
   * Suspends a subscription (e.g. for non-payment or breach of terms).
   */
  async suspendSubscription(cmd: SuspendSubscriptionCommand): Promise<void> {
    const sub = await this.db
      .selectFrom('organisation_subscriptions')
      .selectAll()
      .where('organisation_id', '=', cmd.organisationId)
      .executeTakeFirst();

    if (!sub) {
      throw new Error(`Subscription for organisation '${cmd.organisationId}' not found`);
    }

    const now = new Date();

    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('organisation_subscriptions')
        .set({
          status: 'suspended',
          updated_at: now,
        })
        .where('id', '=', sub.id)
        .execute();

      const outboxPayload: SubscriptionSuspendedEventPayload = {
        subscriptionId: sub.id,
        organisationId: cmd.organisationId,
        reason: cmd.reason,
        suspendedAt: now.toISOString(),
      };

      const envelope = createEventEnvelope(
        KafkaTopics.SUBSCRIPTION_SUSPENDED,
        'aethra-subscription-service',
        {
          organisationId: cmd.organisationId,
          correlationId: cmd.correlationId,
        },
        outboxPayload,
      );

      await trx
        .insertInto('outbox_events')
        .values({
          id: crypto.randomUUID(),
          event_type: envelope.eventType,
          topic: KafkaTopics.SUBSCRIPTION_SUSPENDED,
          partition_key: cmd.organisationId,
          payload: envelope as unknown as Record<string, unknown>,
          correlation_id: cmd.correlationId,
          status: 'pending',
          retry_count: 0,
          created_at: now,
        })
        .execute();
    });
  }

  /**
   * Retrieves the current subscription, entitled modules, and active quotas for a tenant.
   */
  async getSubscriptionDetails(organisationId: string): Promise<Record<string, unknown> | null> {
    const subscription = await this.db
      .selectFrom('organisation_subscriptions as os')
      .innerJoin('subscription_plans as sp', 'sp.id', 'os.plan_id')
      .select([
        'os.id as subscription_id',
        'os.organisation_id',
        'os.status',
        'os.current_period_start',
        'os.current_period_end',
        'os.trial_ends_at',
        'sp.code as plan_code',
        'sp.name as plan_name',
        'sp.billing_cycle',
      ])
      .where('os.organisation_id', '=', organisationId)
      .executeTakeFirst();

    if (!subscription) return null;

    const modules = await this.db
      .selectFrom('subscription_modules as sm')
      .innerJoin('module_catalogue as mc', 'mc.id', 'sm.module_id')
      .select(['mc.code', 'mc.name', 'sm.status', 'sm.activated_at'])
      .where('sm.organisation_id', '=', organisationId)
      .execute();

    const limits = await this.db
      .selectFrom('entitlement_limits')
      .selectAll()
      .where('organisation_id', '=', organisationId)
      .execute();

    return {
      ...subscription,
      modules,
      limits,
    };
  }
}
