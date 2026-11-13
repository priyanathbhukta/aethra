// ==============================================================================
// AETHRA Vendor Relationship Service — Isolation & Security Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import { VendorRelationshipApplicationService } from '../application/vendor-relationship.service.js';

test('Vendor Relationship Service — Multi-Vendor Consent, Isolation & Revocation', async (t) => {
  await t.test('Scenario 1: Vendor A cannot access customer data without explicit active relationship', async () => {
    const mockDb: any = {
      selectFrom: () => ({
        selectAll: () => ({
          where: (_c1: string, _o1: string, _v1: any) => ({
            where: (_c2: string, _o2: string, _v2: any) => ({
              where: () => ({
                executeTakeFirst: async () => null, // No active relationship for Vendor A
              }),
            }),
          }),
        }),
      }),
    };

    const service = new VendorRelationshipApplicationService(mockDb);
    const result = await service.validateVendorAccess({
      organisationId: 'vendor-A-id',
      customerId: 'cust-xyz',
    });

    assert.strictEqual(result.isAuthorized, false);
    assert.strictEqual(result.reason, 'No active relationship between vendor and customer');
  });

  await t.test('Scenario 2: Relationship initiation creates pending record and queues outbox event', async () => {
    const insertedRecords: Record<string, any[]> = {
      vendor_customer_relationships: [],
      outbox_events: [],
    };

    const mockDb: any = {
      selectFrom: (table: string) => ({
        selectAll: () => ({
          where: () => ({
            executeTakeFirst: async () => {
              if (table === 'relationship_purposes') {
                return { id: 'purp-epc', code: 'epc_installation', display_name: 'EPC' };
              }
              return null;
            },
          }),
        }),
      }),
      transaction: () => ({
        execute: async (fn: any) => {
          const trxMock = {
            insertInto: (table: string) => ({
              values: (vals: any) => {
                insertedRecords[table].push(vals);
                return {
                  returningAll: () => ({
                    executeTakeFirstOrThrow: async () => vals,
                  }),
                  execute: async () => {},
                };
              },
            }),
          };
          return fn(trxMock);
        },
      }),
    };

    const service = new VendorRelationshipApplicationService(mockDb);
    const rel = await service.initiateRelationship({
      organisationId: 'vendor-sunvolt-01',
      customerId: 'cust-aditi-001',
      purposeCode: 'epc_installation',
      correlationId: 'corr-rel-101',
    });

    assert.ok(rel);
    assert.strictEqual(rel.status, 'pending');
    assert.strictEqual(insertedRecords.vendor_customer_relationships.length, 1);
    assert.strictEqual(insertedRecords.outbox_events.length, 1);
    assert.strictEqual(insertedRecords.outbox_events[0].event_type, 'vendor_relationship.created.v1');
    assert.strictEqual(insertedRecords.outbox_events[0].correlation_id, 'corr-rel-101');
  });

  await t.test('Scenario 3: Customer digital consent activates relationship and provisions access grants', async () => {
    const insertedRecords: Record<string, any[]> = {
      customer_consents: [],
      vendor_access_grants: [],
      outbox_events: [],
    };

    const mockDb: any = {
      selectFrom: () => ({
        innerJoin: () => ({
          select: () => ({
            where: () => ({
              executeTakeFirst: async () => ({
                id: 'rel-99',
                organisation_id: 'org-vendor-1',
                customer_id: 'cust-1',
                purpose_id: 'purp-epc',
                status: 'pending',
                purpose_code: 'epc_installation',
              }),
            }),
          }),
        }),
      }),
      transaction: () => ({
        execute: async (fn: any) => {
          const trxMock = {
            insertInto: (table: string) => ({
              values: (vals: any) => {
                insertedRecords[table].push(vals);
                return {
                  execute: async () => {},
                };
              },
            }),
            updateTable: () => ({
              set: (vals: any) => ({
                where: () => ({
                  returningAll: () => ({
                    executeTakeFirstOrThrow: async () => ({ id: 'rel-99', status: vals.status, activated_at: vals.activated_at }),
                  }),
                }),
              }),
            }),
          };
          return fn(trxMock);
        },
      }),
    };

    const service = new VendorRelationshipApplicationService(mockDb);
    const result = await service.acceptConsentAndActivate({
      relationshipId: 'rel-99',
      userId: 'usr-customer-aditi',
      consentVersion: 'v1.0',
      ipAddress: '106.51.24.11',
      userAgent: 'Mozilla/5.0 Android',
      correlationId: 'corr-consent-102',
    });

    assert.ok(result);
    assert.strictEqual(result.status, 'active');
    assert.strictEqual(insertedRecords.customer_consents.length, 1);
    assert.strictEqual(insertedRecords.vendor_access_grants.length, 1);
    assert.strictEqual(insertedRecords.outbox_events.length, 1);
    assert.strictEqual(insertedRecords.outbox_events[0].event_type, 'vendor_relationship.activated.v1');
  });

  await t.test('Scenario 4: Immediate relationship revocation writes audit history and emits revocation outbox event', async () => {
    const insertedRecords: Record<string, any[]> = {
      access_revocation_history: [],
      outbox_events: [],
    };
    const updatedStatus: Record<string, any> = {};

    const mockDb: any = {
      selectFrom: () => ({
        selectAll: () => ({
          where: () => ({
            executeTakeFirst: async () => ({
              id: 'rel-to-revoke',
              organisation_id: 'vendor-org-1',
              customer_id: 'cust-1',
              status: 'active',
            }),
          }),
        }),
      }),
      transaction: () => ({
        execute: async (fn: any) => {
          const trxMock = {
            insertInto: (table: string) => ({
              values: (vals: any) => {
                insertedRecords[table].push(vals);
                return {
                  execute: async () => {},
                };
              },
            }),
            updateTable: (table: string) => ({
              set: (vals: any) => ({
                where: () => ({
                  execute: async () => {
                    updatedStatus[table] = vals;
                  },
                }),
              }),
            }),
          };
          return fn(trxMock);
        },
      }),
    };

    const service = new VendorRelationshipApplicationService(mockDb);
    await service.revokeRelationship({
      relationshipId: 'rel-to-revoke',
      revocationReason: 'Customer switched maintenance vendor',
      revokedByUserId: 'usr-cust-owner-01',
      correlationId: 'corr-revoc-999',
    });

    assert.strictEqual(insertedRecords.access_revocation_history.length, 1);
    assert.strictEqual(insertedRecords.access_revocation_history[0].revocation_reason, 'Customer switched maintenance vendor');
    assert.strictEqual(updatedStatus.vendor_customer_relationships.status, 'revoked');
    assert.strictEqual(updatedStatus.vendor_access_grants.is_active, false);

    assert.strictEqual(insertedRecords.outbox_events.length, 1);
    assert.strictEqual(insertedRecords.outbox_events[0].event_type, 'vendor_relationship.revoked.v1');
    assert.strictEqual(insertedRecords.outbox_events[0].correlation_id, 'corr-revoc-999');
  });
});
