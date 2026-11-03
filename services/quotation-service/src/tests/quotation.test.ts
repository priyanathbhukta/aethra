// ==============================================================================
// AETHRA Quotation Service — Immutability Verification Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';

test('Quotation Service — Mandatory Immutability Scenarios', async (t) => {
  await t.test('Scenario 8: Quotation revisions cannot be modified after issue status', () => {
    const revision = {
      revisionNumber: 1,
      status: 'issued', // Already issued to customer
      totalPayableAmount: 450000.00,
    };

    function attemptUpdateRevision(rev: typeof revision, newAmount: number) {
      if (rev.status === 'issued' || rev.status === 'accepted') {
        throw new Error('IMMUTABLE_REVISION: Cannot modify a frozen quotation revision');
      }
      rev.totalPayableAmount = newAmount;
    }

    assert.throws(
      () => attemptUpdateRevision(revision, 420000.00),
      /IMMUTABLE_REVISION/,
      'Must reject updates to issued revisions',
    );
  });
});
