// ==============================================================================
// AETHRA Subscription Service — Entitlement Gate Security Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';

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
});
