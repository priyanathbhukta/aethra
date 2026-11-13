// ==============================================================================
// AETHRA Web UI — Solar Engineering Sizing & Feasibility Estimator View
// ==============================================================================

import React, { useState } from 'react';
import { Card } from '../ui/Card.js';
import { Button } from '../ui/Button.js';
import { Badge } from '../ui/Badge.js';
import { SolarEstimatorEngine } from '../../services/solarEstimator.js';
import { SolarEstimatorInput } from '../../types/web.types.js';

export const SolarEstimatorView: React.FC<{ onCreateQuote?: (capacityKw: number) => void }> = ({
  onCreateQuote,
}) => {
  const [inputs, setInputs] = useState<SolarEstimatorInput>({
    sanctionedLoadKw: 10.0,
    averageMonthlyConsumptionKwh: 1200,
    tariffRatePerKwh: 8.5,
    availableRoofAreaSqFt: 1200,
    shadeFactorPercentage: 10,
    customerType: 'residential',
  });

  const result = SolarEstimatorEngine.calculate(inputs);

  const formatInr = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Solar Engineering Estimator</h1>
        <p className="text-xs text-slate-500 mt-1">
          DISCOM bill analysis, shadow-free roof area sizing, generation yield, and ROI payback
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Parameters Panel */}
        <div className="lg:col-span-1">
          <Card title="DISCOM Bill & Site Inputs">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Customer Segment
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setInputs({ ...inputs, customerType: 'residential' })}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                      inputs.customerType === 'residential'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Residential Rooftop
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputs({ ...inputs, customerType: 'commercial' })}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                      inputs.customerType === 'commercial'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Commercial & C&I
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Sanctioned Load (kW)
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  value={inputs.sanctionedLoadKw}
                  onChange={(e) => setInputs({ ...inputs, sanctionedLoadKw: parseFloat(e.target.value) || 1 })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Monthly Consumption (kWh / Units)
                </label>
                <input
                  type="number"
                  min="50"
                  step="50"
                  value={inputs.averageMonthlyConsumptionKwh}
                  onChange={(e) => setInputs({ ...inputs, averageMonthlyConsumptionKwh: parseInt(e.target.value) || 100 })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Grid Tariff Rate (₹ / kWh)
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  value={inputs.tariffRatePerKwh}
                  onChange={(e) => setInputs({ ...inputs, tariffRatePerKwh: parseFloat(e.target.value) || 5 })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Available Roof Area (sq. ft)
                </label>
                <input
                  type="number"
                  min="100"
                  step="100"
                  value={inputs.availableRoofAreaSqFt}
                  onChange={(e) => setInputs({ ...inputs, availableRoofAreaSqFt: parseInt(e.target.value) || 100 })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                  <span>Shade & Obstacle Factor</span>
                  <span>{inputs.shadeFactorPercentage}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  value={inputs.shadeFactorPercentage}
                  onChange={(e) => setInputs({ ...inputs, shadeFactorPercentage: parseInt(e.target.value) || 0 })}
                  className="w-full accent-emerald-600"
                />
              </div>
            </div>
          </Card>
        </div>

        {/* Engineering Recommendations & Financial ROI */}
        <div className="lg:col-span-2 space-y-6">
          <Card title="Recommended Solar System Sizing">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                <div className="text-xs font-semibold text-emerald-800 uppercase">System Capacity</div>
                <div className="text-3xl font-extrabold text-emerald-900 mt-1">
                  {result.recommendedCapacityKw} <span className="text-lg">kWp</span>
                </div>
                <div className="text-[11px] text-emerald-700 mt-1">Optimal size for demand</div>
              </div>

              <div className="p-4 bg-sky-50 rounded-xl border border-sky-100">
                <div className="text-xs font-semibold text-sky-800 uppercase">Annual Yield</div>
                <div className="text-3xl font-extrabold text-sky-900 mt-1">
                  {result.estimatedAnnualGenerationKwh.toLocaleString()} <span className="text-lg">kWh</span>
                </div>
                <div className="text-[11px] text-sky-700 mt-1">~1,450 units/kWp/yr</div>
              </div>

              <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                <div className="text-xs font-semibold text-amber-800 uppercase">Payback Period</div>
                <div className="text-3xl font-extrabold text-amber-900 mt-1">
                  {result.paybackPeriodYears} <span className="text-lg">Years</span>
                </div>
                <div className="text-[11px] text-amber-700 mt-1">High ROI investment</div>
              </div>

              <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
                <div className="text-xs font-semibold text-purple-800 uppercase">CO2 Offset</div>
                <div className="text-3xl font-extrabold text-purple-900 mt-1">
                  {result.co2OffsetTonnesAnnual} <span className="text-lg">T/yr</span>
                </div>
                <div className="text-[11px] text-purple-700 mt-1">Green energy impact</div>
              </div>
            </div>

            {/* Regulatory Feasibility & Shadow-Free Area Verification */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 mb-6 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium">DISCOM Net-Metering Feasibility:</span>
                {result.isFeasibleWithinSanctionedLoad ? (
                  <Badge variant="success">Permissible (Capacity ≤ Sanctioned Load)</Badge>
                ) : (
                  <Badge variant="warning">Requires Sanctioned Load Enhancement</Badge>
                )}
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium">Required Roof Shadow-Free Area:</span>
                <span className="font-semibold text-slate-800">
                  {result.requiredRoofAreaSqFt} sq. ft. (available: {inputs.availableRoofAreaSqFt} sq. ft.)
                </span>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="border-t border-slate-200 pt-4 flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <div className="text-xs text-slate-500">Estimated Turnkey EPC Investment</div>
                <div className="text-2xl font-bold text-slate-900">
                  {formatInr(result.estimatedSystemCostInr)}
                </div>
                <div className="text-xs text-emerald-600 font-medium">
                  Estimated Annual Savings: {formatInr(result.estimatedAnnualSavingsInr)}/yr
                </div>
              </div>
              {onCreateQuote && (
                <Button variant="primary" onClick={() => onCreateQuote(result.recommendedCapacityKw)}>
                  Generate Formal Quotation ({result.recommendedCapacityKw} kWp) →
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
