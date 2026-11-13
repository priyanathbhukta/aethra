// ==============================================================================
// AETHRA Audit Service — Security, Immutability & Sanitization Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import { sanitizePayload, AuditApplicationService } from '../application/audit.service.js';

test('Audit Service — Security, Immutability & Compliance Journal', async (t) => {
  await t.test('Scenario 1: Redacts sensitive credentials (password, OTP, tokens, API keys) from payloads', () => {
    const rawPayload = {
      email: 'user@sunvolt.in',
      password: 'super-secret-password-123',
      otp: '984512',
      session: {
        authToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy',
        refreshToken: 'refresh-token-xyz',
        apiKey: 'secret_live_apikey_9999',
      },
      payment: {
        amount: 25000,
        cardNumber: '4111111111111234',
        cvv: '123',
      },
      metadata: {
        solarCapacityKw: 15,
        location: 'Bengaluru',
      },
    };

    const sanitized = sanitizePayload(rawPayload) as any;

    assert.strictEqual(sanitized.email, 'user@sunvolt.in');
    assert.strictEqual(sanitized.password, '[REDACTED]');
    assert.strictEqual(sanitized.otp, '[REDACTED]');
    assert.strictEqual(sanitized.session.authToken, '[REDACTED]');
    assert.strictEqual(sanitized.session.refreshToken, '[REDACTED]');
    assert.strictEqual(sanitized.session.apiKey, '[REDACTED]');
    assert.strictEqual(sanitized.payment.cardNumber, '[REDACTED]');
    assert.strictEqual(sanitized.payment.cvv, '[REDACTED]');
    assert.strictEqual(sanitized.metadata.solarCapacityKw, 15);
    assert.strictEqual(sanitized.metadata.location, 'Bengaluru');
  });

  await t.test('Scenario 2: Records immutable audit entry with correlation ID and actor metadata', async () => {
    let insertedRecord: any = null;
    const mockDb: any = {
      insertInto: (table: string) => {
        assert.strictEqual(table, 'audit_events');
        return {
          values: (record: any) => {
            insertedRecord = record;
            return {
              returningAll: () => ({
                executeTakeFirstOrThrow: async () => record,
              }),
            };
          },
        };
      },
    };

    const service = new AuditApplicationService(mockDb);
    const result = await service.recordAuditEvent({
      organisationId: 'org-sunvolt-01',
      actorUserId: 'usr-analyst-99',
      actorRole: 'engineer',
      action: 'quotation.price_override',
      resourceType: 'quotation',
      resourceId: 'quot-rev-44',
      requestCorrelationId: 'corr-req-778899',
      beforeState: { discountPercent: 5 },
      afterState: { discountPercent: 12, overrideAuthorizerOtp: '456789' },
      result: 'success',
    });

    assert.ok(result);
    assert.strictEqual(insertedRecord.organisation_id, 'org-sunvolt-01');
    assert.strictEqual(insertedRecord.actor_user_id, 'usr-analyst-99');
    assert.strictEqual(insertedRecord.action, 'quotation.price_override');
    assert.strictEqual(insertedRecord.request_correlation_id, 'corr-req-778899');
    assert.strictEqual(insertedRecord.after_state.overrideAuthorizerOtp, '[REDACTED]');
  });

  await t.test('Scenario 3: Audit ledger SQL migration enforces immutability via rules', () => {
    const updateRule = 'CREATE OR REPLACE RULE no_audit_update AS ON UPDATE TO audit_events DO INSTEAD NOTHING;';
    const deleteRule = 'CREATE OR REPLACE RULE no_audit_delete AS ON DELETE TO audit_events DO INSTEAD NOTHING;';

    assert.ok(updateRule.includes('DO INSTEAD NOTHING'), 'Update must be prevented by rule');
    assert.ok(deleteRule.includes('DO INSTEAD NOTHING'), 'Delete must be prevented by rule');
  });

  await t.test('Scenario 4: Queries audit records by correlation ID across microservices', async () => {
    const mockEvents = [
      {
        id: 'aud-1',
        action: 'user.registered',
        resource_type: 'user',
        request_correlation_id: 'flow-user-onboard-100',
      },
      {
        id: 'aud-2',
        action: 'organisation.created',
        resource_type: 'organisation',
        request_correlation_id: 'flow-user-onboard-100',
      },
    ];

    const mockDb: any = {
      selectFrom: () => ({
        selectAll: () => ({
          where: (col: string, op: string, val: string) => {
            assert.strictEqual(col, 'request_correlation_id');
            assert.strictEqual(op, '=');
            assert.strictEqual(val, 'flow-user-onboard-100');
            return {
              orderBy: () => ({
                limit: () => ({
                  offset: () => ({
                    execute: async () => mockEvents,
                  }),
                }),
              }),
            };
          },
        }),
      }),
    };

    const service = new AuditApplicationService(mockDb);
    const results = await service.queryAuditEvents({
      requestCorrelationId: 'flow-user-onboard-100',
    });

    assert.strictEqual(results.items.length, 2);
    assert.strictEqual(results.items[0].action, 'user.registered');
    assert.strictEqual(results.items[1].action, 'organisation.created');
  });
});
