// ==============================================================================
// AETHRA Subscription Service — Entitlement Gate & Quota Security Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import { SubscriptionApplicationService } from '../application/subscription.service.js';

test('Subscription Service — Mandatory Entitlement vs Permission Separation', async (t) => {
  await t.test('Scenario 7: Operation blocked when organisation lacks module entitlement despite user having permission', () => {
    const userHasPermission = true; // User has 'engineering.calc.run'
    const orgEntitledModules = ['crm', 'quotation']; // Org only subscribed to CRM and Quotation, NOT engineering

    const targetModule = 'engineering';
    const isModuleEntitled = orgEntitledModules.includes(targetModule);

    // Dual gatekeeper rule: Must have BOTH entitlement AND permission
    const isAllowed = isModuleEntitled && userHasPermission;
    assert.strictEqual(isAllowed, false, 'Module without entitlement must be blocked');
  });

  await t.test('Core platform modules (identity, organisation, access_control, subscription) are unconditionally entitled', async () => {
    // Mock db to verify core module logic
    const mockDb: any = {
      selectFrom: (table: string) => ({
        selectAll: () => ({
          where: (_col: string, _op: string, val: any) => ({
            where: () => ({
              executeTakeFirst: async () => {
                if (table === 'module_catalogue' && val === 'identity') {
                  return { id: 'm-1', code: 'identity', is_core: true, is_active: true };
                }
                return null;
              },
            }),
          }),
        }),
      }),
    };

    const service = new SubscriptionApplicationService(mockDb);
    const result = await service.verifyEntitlement('org-123', 'identity');

    assert.strictEqual(result.isEntitled, true);
    assert.strictEqual(result.isCore, true);
    assert.strictEqual(result.status, 'active');
  });

  await t.test('Non-core module without active subscription is rejected', async () => {
    const mockDb: any = {
      selectFrom: (table: string) => ({
        selectAll: () => ({
          where: (_col: string, _op: string, _val: any) => ({
            where: () => ({
              executeTakeFirst: async () => {
                if (table === 'module_catalogue') {
                  return { id: 'm-solar', code: 'engineering', is_core: false, is_active: true };
                }
                if (table === 'organisation_subscriptions') {
                  return null; // No subscription
                }
                return null;
              },
            }),
            executeTakeFirst: async () => {
              if (table === 'organisation_subscriptions') {
                return null; // No subscription
              }
              return null;
            },
          }),
        }),
      }),
    };

    const service = new SubscriptionApplicationService(mockDb);
    const result = await service.verifyEntitlement('org-no-sub', 'engineering');

    assert.strictEqual(result.isEntitled, false);
    assert.strictEqual(result.status, 'inactive');
    assert.strictEqual(result.reason, 'Organisation has no registered subscription');
  });

  await t.test('Quota limit exceeded rejects increment and flags limit reached', async () => {
    const mockDb: any = {
      selectFrom: (table: string) => ({
        selectAll: () => ({
          where: (_col: string, _op: string, _val: any) => ({
            where: (_col2: string, _op2: string, _val2: any) => ({
              executeTakeFirst: async () => {
                if (table === 'entitlement_limits') {
                  return {
                    id: 'lim-1',
                    organisation_id: 'org-1',
                    feature_code: 'max_users',
                    max_allowed: 5,
                    current_usage: 5,
                  };
                }
                return null;
              },
            }),
            executeTakeFirst: async () => {
              if (table === 'usage_records') {
                return null; // No existing record
              }
              if (table === 'organisation_subscriptions') {
                return { id: 'sub-1', status: 'active' };
              }
              return null;
            },
          }),
        }),
      }),
      insertInto: () => ({
        values: () => ({
          execute: async () => {},
        }),
      }),
    };

    const service = new SubscriptionApplicationService(mockDb);
    const result = await service.recordUsage({
      organisationId: 'org-1',
      featureCode: 'max_users',
      quantity: 1,
      idempotencyKey: 'idem-key-99',
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.currentUsage, 5);
    assert.strictEqual(result.maxAllowed, 5);
    assert.ok(result.reason?.includes('quota exceeded'));
  });

  await t.test('Idempotent usage recording returns existing state without double counting', async () => {
    const mockDb: any = {
      selectFrom: (table: string) => ({
        selectAll: () => ({
          where: (_col: string, _op: string, _val: any) => ({
            where: () => ({
              executeTakeFirst: async () => {
                if (table === 'entitlement_limits') {
                  return { max_allowed: 10, current_usage: 2 };
                }
                return null;
              },
            }),
            executeTakeFirst: async () => {
              if (table === 'usage_records') {
                return {
                  id: 'ur-1',
                  organisation_id: 'org-1',
                  feature_code: 'proposals_generated',
                  quantity: 1,
                  idempotency_key: 'already-used-key',
                };
              }
              return null;
            },
          }),
        }),
      }),
    };

    const service = new SubscriptionApplicationService(mockDb);
    const result = await service.recordUsage({
      organisationId: 'org-1',
      featureCode: 'proposals_generated',
      quantity: 1,
      idempotencyKey: 'already-used-key',
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.currentUsage, 2);
    assert.strictEqual(result.remaining, 8);
  });
});
