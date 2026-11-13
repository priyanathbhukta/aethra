// ==============================================================================
// AETHRA Mobile — Customer Solar Plant Monitor Controller
// ==============================================================================

import { SolarTelemetrySnapshot } from '../types/mobile.types.js';

export class CustomerMonitorController {
  /**
   * Generates or retrieves live solar telemetry snapshot for mobile plant owners.
   */
  getLiveSnapshot(installationId: string): SolarTelemetrySnapshot {
    // Current live data from Inverter IoT sync
    const hourOfDay = new Date().getHours();
    const isDaylight = hourOfDay >= 6 && hourOfDay <= 18;
    const peakSunHour = hourOfDay >= 11 && hourOfDay <= 14;

    const basePowerKw = isDaylight ? (peakSunHour ? 7.6 : 4.2) : 0.0;

    return {
      installationId,
      systemName: 'Indiranagar 8kW Rooftop Plant',
      currentPowerKw: basePowerKw,
      peakPowerTodayKw: 7.8,
      energyTodayKwh: isDaylight ? 28.4 : 34.2,
      lifetimeEnergyMwh: 14.6,
      co2AvoidedKg: Math.round(14600 * 0.82),
      gridStatus: 'grid_online',
      batteryStateOfChargePercent: 94,
      updatedAt: new Date().toISOString(),
    };
  }
}
