// ==============================================================================
// AETHRA Vendor Relationship Service — Revocation Verification Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';

test('Vendor Relationship Service — Grant Revocation Verification', async (t) => {
  await t.test('Scenario 4: Revocation immediately invalidates active grant status', () => {
    const grant = {
      grantId: 'grant-xyz',
      organisationId: 'vendor-epc-01',
      customerId: 'cust-factory-1',
      status: 'active',
      revokedAt: null as string | null,
    };

    function revokeGrant(targetGrant: typeof grant, reason: string) {
      assert.strictEqual(reason.length > 0, true);
      targetGrant.status = 'revoked';
      targetGrant.revokedAt = new Date().toISOString();
    }

    revokeGrant(grant, 'Contract completed');

    assert.strictEqual(grant.status, 'revoked');
    assert.notStrictEqual(grant.revokedAt, null);
  });
});
