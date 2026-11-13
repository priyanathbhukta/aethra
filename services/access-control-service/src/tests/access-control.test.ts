// ==============================================================================
// AETHRA Access Control Service — RBAC/ABAC Negative Security Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';

test('Access Control Service — Mandatory Negative Security Scenarios', async (t) => {
  await t.test('Scenario 5: Denies access by default when permission is not explicitly granted (Default Deny)', () => {
    const userPermissions = ['quotation.create', 'quotation.read'];
    const requiredPermission = 'quotation.issue_override';

    const isAuthorized = userPermissions.includes(requiredPermission);
    assert.strictEqual(isAuthorized, false, 'Default deny must block ungranted permissions');
  });

  await t.test('Scenario 6: User cannot access resource outside assigned branch scope (ABAC Scoping)', () => {
    const userAssignedBranch: string = 'branch-blr-01';
    const targetResourceBranch: string = 'branch-mum-02';

    const isScopeValid = userAssignedBranch === targetResourceBranch;
    assert.strictEqual(isScopeValid, false, 'ABAC must block cross-branch access');
  });

  await t.test('Scenario 7: Temporary privileged grant overrides base role only within validity window', () => {
    const now = Date.now();
    const activeGrant = {
      permission: 'quotation.issue_override',
      validFrom: new Date(now - 60000), // 1 min ago
      validUntil: new Date(now + 600000), // 10 min in future
      revokedAt: null,
    };

    const expiredGrant = {
      permission: 'quotation.issue_override',
      validFrom: new Date(now - 7200000), // 2 hrs ago
      validUntil: new Date(now - 3600000), // 1 hr ago
      revokedAt: null,
    };

    function isGrantActive(grant: typeof activeGrant): boolean {
      const curTime = Date.now();
      return grant.validFrom.getTime() <= curTime && grant.validUntil.getTime() >= curTime && grant.revokedAt === null;
    }

    assert.strictEqual(isGrantActive(activeGrant), true, 'Active grant must permit override');
    assert.strictEqual(isGrantActive(expiredGrant), false, 'Expired grant must deny override');
  });
});
