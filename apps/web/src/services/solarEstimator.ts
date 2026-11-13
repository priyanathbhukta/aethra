// ==============================================================================
// AETHRA Web — Solar Engineering Sizing & Financial ROI Calculator Engine
// ==============================================================================

import { SolarEstimatorInput, SolarEstimatorResult } from '../types/web.types.js';

export class SolarEstimatorEngine {
  /**
   * Benchmarks:
   * - 1 kWp Solar Rooftop produces ~1,450 kWh annually in India.
   * - 1 kWp requires ~100 sq. ft. shadow-free roof area.
   * - Commercial benchmark cost: ₹50,000 to ₹55,000 per kWp installed.
   * - Grid emission factor: ~0.82 kg CO2 per kWh.
   */
  static calculate(input: SolarEstimatorInput): SolarEstimatorResult {
    const {
      sanctionedLoadKw,
      averageMonthlyConsumptionKwh,
      tariffRatePerKwh,
      availableRoofAreaSqFt,
      shadeFactorPercentage,
    } = input;

    // 1. Capacity based on monthly energy demand
    const annualConsumptionKwh = averageMonthlyConsumptionKwh * 12;
    const baseCapacityFromConsumption = annualConsumptionKwh / 1450.0;

    // 2. Capacity based on roof area limit (100 sq. ft per kWp)
    const effectiveRoofArea = availableRoofAreaSqFt * (1 - shadeFactorPercentage / 100.0);
    const maxCapacityFromRoof = effectiveRoofArea / 100.0;

    // 3. Recommended Capacity is bounded by roof area, consumption, and typically capped at 100% of sanctioned load by DISCOM net-metering regulations
    let recommendedKw = Math.min(baseCapacityFromConsumption, maxCapacityFromRoof);
    const isFeasibleWithinSanctionedLoad = recommendedKw <= sanctionedLoadKw;

    // Round to 1 decimal place (e.g., 5.5 kWp)
    recommendedKw = Math.max(1.0, Math.round(recommendedKw * 10) / 10);

    // 4. Annual Generation calculation
    const efficiencyFactor = 1.0 - (shadeFactorPercentage / 100.0) * 0.5;
    const estimatedAnnualGenerationKwh = Math.round(recommendedKw * 1450 * efficiencyFactor);

    // 5. Financials
    const estimatedAnnualSavingsInr = Math.round(estimatedAnnualGenerationKwh * tariffRatePerKwh);

    // Turnkey benchmark cost: ₹52,000 per kWp
    const costPerKw = input.customerType === 'residential' ? 55000 : 48000;
    const estimatedSystemCostInr = Math.round(recommendedKw * costPerKw);

    const paybackPeriodYears =
      estimatedAnnualSavingsInr > 0
        ? Math.round((estimatedSystemCostInr / estimatedAnnualSavingsInr) * 10) / 10
        : 0;

    // 6. Environmental CO2 Offset
    const co2OffsetTonnesAnnual =
      Math.round(((estimatedAnnualGenerationKwh * 0.82) / 1000.0) * 10) / 10;

    const requiredRoofAreaSqFt = Math.round(recommendedKw * 100);

    return {
      recommendedCapacityKw: recommendedKw,
      estimatedAnnualGenerationKwh,
      estimatedAnnualSavingsInr,
      estimatedSystemCostInr,
      paybackPeriodYears,
      co2OffsetTonnesAnnual,
      requiredRoofAreaSqFt,
      isFeasibleWithinSanctionedLoad,
    };
  }
}
