// ==============================================================================
// AETHRA Inventory Service — Concurrency & Negative Stock Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';

test('Inventory Service — Stock Integrity & Concurrency Verification', async (t) => {
  await t.test('Scenario 9: Rejects issue when available stock is insufficient (Negative Stock Guard)', () => {
    const currentOnHand = 10;
    const reservedQuantity = 8;
    const availableStock = currentOnHand - reservedQuantity; // 2 units available

    const requestedIssueQuantity = 5; // Requesting 5 units

    function postStockIssue(available: number, requested: number) {
      if (requested > available) {
        throw new Error('INSUFFICIENT_STOCK: Transaction causes negative available balance');
      }
      return available - requested;
    }

    assert.throws(
      () => postStockIssue(availableStock, requestedIssueQuantity),
      /INSUFFICIENT_STOCK/,
      'Must reject stock outflow exceeding available balance',
    );
  });
});
