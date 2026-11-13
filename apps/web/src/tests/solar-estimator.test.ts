// ==============================================================================
// AETHRA Web — Solar Engineering Estimator Unit Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import { SolarEstimatorEngine } from '../services/solarEstimator.js';

test('Web App — Solar Engineering Sizing & Feasibility Calculator', async (t) => {
  await t.test('Scenario 1: Computes optimal rooftop capacity, annual yield, and payback period', () => {
    const input = {
      sanctionedLoadKw: 10.0,
      averageMonthlyConsumptionKwh: 1200,
      tariffRatePerKwh: 8.5,
      availableRoofAreaSqFt: 1200,
      shadeFactorPercentage: 10,
      customerType: 'residential' as const,
    };

    const result = SolarEstimatorEngine.calculate(input);

    assert.ok(result);
    // 1200 * 12 = 14,400 kWh / 1450 = ~9.9 kWp
    assert.strictEqual(result.recommendedCapacityKw, 9.9);
    assert.strictEqual(result.isFeasibleWithinSanctionedLoad, true);

    // Yield ~ 9.9 * 1450 * (1 - 0.05) = ~13,637 kWh
    assert.ok(result.estimatedAnnualGenerationKwh > 13000);
    assert.ok(result.estimatedAnnualSavingsInr > 100000);

    // Turnkey cost for 9.9 kWp @ ₹55,000 = ~₹544,500
    assert.strictEqual(result.estimatedSystemCostInr, 544500);

    // Payback period ~ 4 to 5 years
    assert.ok(result.paybackPeriodYears >= 4.0 && result.paybackPeriodYears <= 5.5);

    // CO2 offset
    assert.ok(result.co2OffsetTonnesAnnual > 10.0);
  });

  await t.test('Scenario 2: Flags non-permissible sizing when capacity exceeds sanctioned load', () => {
    const input = {
      sanctionedLoadKw: 3.0, // Small 3kW connection
      averageMonthlyConsumptionKwh: 1000,
      tariffRatePerKwh: 8.0,
      availableRoofAreaSqFt: 1500,
      shadeFactorPercentage: 0,
      customerType: 'residential' as const,
    };

    const result = SolarEstimatorEngine.calculate(input);

    // Recommended capacity ~8.3 kWp exceeds 3kW sanctioned load
    assert.strictEqual(result.isFeasibleWithinSanctionedLoad, false);
    assert.ok(result.recommendedCapacityKw > input.sanctionedLoadKw);
  });
});
