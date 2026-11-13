// ==============================================================================
// AETHRA AI Service — Intelligent Workflows & Heuristic Extraction Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import { AiApplicationService } from '../application/ai.service.js';

test('AI Service — Structured Bill Extraction & Automated Ticket Triage', async (t) => {
  const service = new AiApplicationService();

  await t.test('Scenario 1: Extracts DISCOM consumer number, sanctioned load, and monthly consumption', async () => {
    const rawBillText = `
      BESCOM ELECTRICITY BILL
      Consumer Number: 05423891002
      Consumer Name: Rajesh Sharma
      Address: Indiranagar, Bangalore
      Tariff: LT-2(a) Domestic
      Sanctioned Load: 7.5 kW
      Current Meter Reading: 18240
      Previous Reading: 17720
      Total Units Consumed: 520
      Due Date: 15-DEC-2026
    `;

    const result = await service.extractElectricityBill(rawBillText);

    assert.ok(result);
    assert.strictEqual(result.consumerNumber, '05423891002');
    assert.strictEqual(result.sanctionedLoadKw, 7.5);
    assert.strictEqual(result.monthlyAverageUnits, 520);
    assert.strictEqual(result.tariffCategory, 'LT-2(a) Domestic');
    assert.ok(result.confidenceScore >= 0.9);
  });

  await t.test('Scenario 2: Triages emergency spark/smoke description into critical priority', async () => {
    const issueText = 'Inverter started emitting smoke and sparking near the DC fuse box!';
    const triage = await service.triageServiceTicket(issueText);

    assert.strictEqual(triage.predictedTicketType, 'inverter_failure');
    assert.strictEqual(triage.predictedPriority, 'critical');
    assert.ok(triage.suggestedAction.includes('Immediate safety shutdown'));
  });

  await t.test('Scenario 3: Triages grid surge and tripping into high priority', async () => {
    const issueText = 'Inverter repeatedly tripping whenever DISCOM voltage fluctuates in the afternoon';
    const triage = await service.triageServiceTicket(issueText);

    assert.strictEqual(triage.predictedTicketType, 'grid_tripping');
    assert.strictEqual(triage.predictedPriority, 'high');
  });

  await t.test('Scenario 4: Triages monkey broken glass into panel damage with routine inspection', async () => {
    const issueText = 'Monkeys jumped on the roof and cracked the front glass of two solar panels';
    const triage = await service.triageServiceTicket(issueText);

    assert.strictEqual(triage.predictedTicketType, 'panel_damage');
    assert.strictEqual(triage.predictedPriority, 'medium');
  });
});
