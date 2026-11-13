// ==============================================================================
// AETHRA Web — Quotation Service & Digital Acceptance Unit Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import { WebQuotationService } from '../services/quotationService.js';
import { WebQuotationView } from '../types/web.types.js';

test('Web App — Quotation Service & Digital Acceptance', async (t) => {
  await t.test('Scenario 1: Computes 13.8% composite solar GST and milestone payment schedule', () => {
    const rawLine = {
      id: 'l-1',
      itemDescription: '550W Tier-1 Bifacial Solar Panels',
      itemType: 'module' as const,
      hsnCode: '85414300',
      quantity: 10,
      unit: 'nos',
      unitPrice: 10000,
      taxRatePercent: 13.8,
    };

    const line = WebQuotationService.calculateLineItem(rawLine);

    assert.strictEqual(line.lineTotal, 100000);
    assert.strictEqual(line.taxAmount, 13800);
    assert.strictEqual(line.netAmount, 113800);

    const totals = WebQuotationService.calculateQuotationTotals([line]);

    assert.strictEqual(totals.subtotalAmount, 100000);
    assert.strictEqual(totals.totalTaxAmount, 13800);
    assert.strictEqual(totals.totalPayableAmount, 113800);

    // Standard 3 milestones: 20%, 60%, 20%
    assert.strictEqual(totals.milestonePayments.length, 3);
    assert.strictEqual(totals.milestonePayments[0].percentage, 20);
    assert.strictEqual(totals.milestonePayments[0].amountInr, 22760);
    assert.strictEqual(totals.milestonePayments[1].percentage, 60);
    assert.strictEqual(totals.milestonePayments[1].amountInr, 68280);
    assert.strictEqual(totals.milestonePayments[2].percentage, 20);
    assert.strictEqual(totals.milestonePayments[2].amountInr, 22760);
  });

  await t.test('Scenario 2: Generates digital click-to-accept signature payload for issued quotation', () => {
    const quotation: WebQuotationView = {
      quotationId: 'quot-test-01',
      quotationNumber: 'QT-2026-0001',
      revisionNumber: 1,
      status: 'issued',
      customerName: 'Aditi Rao',
      customerEmail: 'aditi@example.com',
      systemCapacityKw: 5.0,
      lines: [],
      subtotalAmount: 200000,
      totalTaxAmount: 27600,
      totalPayableAmount: 227600,
      validUntil: '2026-12-31',
      milestonePayments: [],
    };

    const acceptance = WebQuotationService.prepareAcceptancePayload(
      quotation,
      'usr-customer-aditi',
      '192.168.1.100'
    );

    assert.ok(acceptance);
    assert.strictEqual(acceptance.quotationId, 'quot-test-01');
    assert.strictEqual(acceptance.acceptedByUserId, 'usr-customer-aditi');
    assert.strictEqual(acceptance.signatureType, 'digital_click');
    assert.strictEqual(acceptance.termsAccepted, true);
    assert.ok(acceptance.acceptedAt);
  });

  await t.test('Scenario 3: Rejects digital acceptance when quotation is in draft status', () => {
    const quotation: WebQuotationView = {
      quotationId: 'quot-draft-01',
      quotationNumber: 'QT-2026-0002',
      revisionNumber: 1,
      status: 'draft', // Not issued yet!
      customerName: 'Ravi Kumar',
      customerEmail: 'ravi@example.com',
      systemCapacityKw: 10.0,
      lines: [],
      subtotalAmount: 400000,
      totalTaxAmount: 55200,
      totalPayableAmount: 455200,
      validUntil: '2026-12-31',
      milestonePayments: [],
    };

    assert.throws(
      () => WebQuotationService.prepareAcceptancePayload(quotation, 'usr-customer-ravi'),
      /Cannot accept quotation in 'draft' status/
    );
  });
});
