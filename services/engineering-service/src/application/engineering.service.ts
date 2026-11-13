// ==============================================================================
// AETHRA Engineering Service — Application Domain Service & Calculation Engine
// ==============================================================================

import crypto from 'node:crypto';
import { Kysely } from 'kysely';
import { EngineeringDatabaseSchema } from '../database/connection.js';
import {
  KafkaTopics,
  createEventEnvelope,
  EngineeringEstimateCompletedEventPayload,
  EngineeringBomGeneratedEventPayload,
} from '@aethra/event-contracts';
import { createStructuredLogger } from '@aethra/observability';
import { RunEngineeringEstimateDto } from '@aethra/api-contracts';

const logger = createStructuredLogger('engineering-service');

export interface RunEngineeringEstimateCommand extends RunEngineeringEstimateDto {
  calculatedByUserId: string;
  correlationId: string;
}

export class EngineeringApplicationService {
  constructor(private readonly db: Kysely<EngineeringDatabaseSchema>) {}

  /**
   * Executes deterministic solar PV sizing, generates reproducible estimates,
   * compiles Bill of Materials (BOM), and dispatches calculation events.
   */
  async runEstimate(cmd: RunEngineeringEstimateCommand) {
    // 1. Locate Calculation Profile Version
    const profileCode = cmd.profileCode || 'in_mnre_residential_v1';
    const profile = await this.db
      .selectFrom('calculation_profiles as cp')
      .innerJoin('calculation_profile_versions as cpv', 'cpv.profile_id', 'cp.id')
      .select([
        'cp.id as profile_id',
        'cp.code as profile_code',
        'cpv.id as version_id',
        'cpv.version_tag',
        'cpv.formula_definitions',
      ])
      .where('cp.code', '=', profileCode)
      .where('cp.is_active', '=', true)
      .executeTakeFirst();

    if (!profile) {
      throw new Error(`Calculation profile '${profileCode}' not found`);
    }

    // 2. Deterministic Calculation Rules (India MNRE Standard)
    const specificYield = 1500; // kWh/kWp/year
    const derateFactor = 0.78; // 78% Performance Ratio
    const co2Factor = 0.82; // 0.82 kg CO2 per kWh grid electricity
    const sqmPerKw = 10.0; // 10 sqm per kWp for standard monocrystalline modules

    // Area-limited vs. Sanctioned load capacity check
    const areaCapacity = cmd.usableAreaSqm / sqmPerKw;
    const sanctionCapacity = cmd.sanctionLoadKw * 1.0;
    const recommendedCapacityKw = Math.max(1.0, Math.min(areaCapacity, sanctionCapacity));
    const roundedCapacity = Math.round(recommendedCapacityKw * 100) / 100;

    const annualGenerationKwh = Math.round(roundedCapacity * specificYield * derateFactor);
    const co2OffsetTons = Math.round(((annualGenerationKwh * co2Factor) / 1000) * 100) / 100;
    const performanceRatioPercent = derateFactor * 100;

    const estimateId = crypto.randomUUID();
    const bomId = crypto.randomUUID();
    const bomVersionId = crypto.randomUUID();
    const now = new Date();
    const year = now.getFullYear();
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const estimateCode = `EST-${year}-${randSuffix}`;
    const bomCode = `BOM-${year}-${randSuffix}`;

    const result = await this.db.transaction().execute(async (trx) => {
      // 3. Create Estimate Master
      const estimate = await trx
        .insertInto('engineering_estimates')
        .values({
          id: estimateId,
          organisation_id: cmd.organisationId,
          estimate_code: estimateCode,
          profile_version_id: profile.version_id,
          customer_id: cmd.customerId || null,
          property_id: cmd.propertyId || null,
          lead_id: cmd.leadId || null,
          status: 'calculated',
          calculated_by_user_id: cmd.calculatedByUserId,
          calculated_at: now,
          created_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // 4. Record Input Snapshots
      const inputs = [
        { key: 'sanction_load_kw', name: 'DISCOM Sanctioned Load', num: cmd.sanctionLoadKw, unit: 'kW' },
        { key: 'roof_usable_area_sqm', name: 'Usable Roof Area', num: cmd.usableAreaSqm, unit: 'sqm' },
        { key: 'tilt_angle_deg', name: 'Installation Tilt Angle', num: cmd.tiltAngleDeg || 15.0, unit: 'deg' },
        { key: 'azimuth_deg', name: 'Azimuth Angle (True South)', num: cmd.azimuthDeg || 180.0, unit: 'deg' },
      ];

      for (const inp of inputs) {
        await trx
          .insertInto('engineering_inputs')
          .values({
            id: crypto.randomUUID(),
            estimate_id: estimateId,
            parameter_key: inp.key,
            parameter_name: inp.name,
            numeric_value: inp.num,
            text_value: null,
            complex_value: null,
            unit: inp.unit,
            recorded_at: now,
          })
          .execute();
      }

      // 5. Record Output Metrics
      const outputs = [
        { key: 'recommended_capacity_kw', name: 'Recommended Solar Capacity', value: roundedCapacity, unit: 'kWp' },
        { key: 'annual_generation_kwh', name: 'Projected Annual Generation', value: annualGenerationKwh, unit: 'kWh/yr' },
        { key: 'co2_offset_tons', name: 'Annual CO2 Mitigation', value: co2OffsetTons, unit: 'tons/yr' },
        { key: 'performance_ratio', name: 'System Performance Ratio', value: performanceRatioPercent, unit: 'percent' },
      ];

      for (const out of outputs) {
        await trx
          .insertInto('calculation_outputs')
          .values({
            id: crypto.randomUUID(),
            estimate_id: estimateId,
            metric_key: out.key,
            metric_name: out.name,
            metric_value: out.value,
            unit: out.unit,
            calculated_at: now,
          })
          .execute();
      }

      // 6. Record Engineering Assumptions
      const assumptions = [
        { key: 'specific_yield', desc: 'Solar Global Horizontal Irradiance specific yield', val: specificYield, unit: 'kWh/kWp/yr', src: 'NREL / MNRE India Solar Atlas' },
        { key: 'derate_factor', desc: 'Overall DC/AC, soiling, and thermal derate factor', val: derateFactor, unit: 'ratio', src: 'MNRE Benchmark Technical Guidelines' },
        { key: 'co2_emission_factor', desc: 'Average CEA India Grid emission factor', val: co2Factor, unit: 'kg/kWh', src: 'CEA Baseline Carbon Database' },
      ];

      for (const asmp of assumptions) {
        await trx
          .insertInto('calculation_assumptions')
          .values({
            id: crypto.randomUUID(),
            estimate_id: estimateId,
            assumption_key: asmp.key,
            description: asmp.desc,
            value: asmp.val,
            unit: asmp.unit,
            source: asmp.src,
          })
          .execute();
      }

      // 7. Compile Bill of Materials (BOM)
      const moduleCount = Math.ceil((roundedCapacity * 1000) / 550); // 550Wp modules
      const inverterCount = Math.max(1, Math.ceil(roundedCapacity / 10)); // 10kW string inverters
      const dcCableMeters = Math.round(roundedCapacity * 15);

      const bom = await trx
        .insertInto('bill_of_materials')
        .values({
          id: bomId,
          estimate_id: estimateId,
          organisation_id: cmd.organisationId,
          bom_code: bomCode,
          status: 'draft',
          created_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx
        .insertInto('bom_versions')
        .values({
          id: bomVersionId,
          bom_id: bomId,
          version_number: 1,
          notes: 'Initial automated sizing BOM',
          created_by_user_id: cmd.calculatedByUserId,
          created_at: now,
        })
        .execute();

      const bomItems = [
        { category: 'solar_module', name: '550Wp Monocrystalline Bifacial Solar PV Modules', qty: moduleCount, unit: 'nos', spec: '550Wp Tier 1 TopCon / PERC' },
        { category: 'inverter', name: `${roundedCapacity} kW Grid-Tied On-Grid Inverter`, qty: inverterCount, unit: 'nos', spec: 'Three-Phase 415V String Inverter' },
        { category: 'mounting_structure', name: 'Aluminium / GI Elevated Rooftop Structure', qty: moduleCount, unit: 'nos', spec: 'Wind resistance up to 150 km/h' },
        { category: 'dc_cable', name: '4 sqmm Copper UV-Resistant DC Solar Cable', qty: dcCableMeters, unit: 'mtr', spec: 'EN50618 Certified Solar Cable' },
        { category: 'bos', name: 'Complete AC/DC Distribution Box & Chemical Earthing Kit', qty: 1, unit: 'nos', spec: 'SPD Type II + MCB + Lightning Arrester' },
      ];

      for (const item of bomItems) {
        await trx
          .insertInto('bom_items')
          .values({
            id: crypto.randomUUID(),
            bom_version_id: bomVersionId,
            organisation_id: cmd.organisationId,
            item_category: item.category as any,
            catalogue_product_id: null,
            item_name: item.name,
            specification_summary: item.spec,
            quantity: item.qty,
            unit: item.unit,
            is_mandatory: true,
            created_at: now,
          })
          .execute();
      }

      // 8. Outbox Event (Estimate Completed)
      const estimatePayload: EngineeringEstimateCompletedEventPayload = {
        estimateId,
        organisationId: cmd.organisationId,
        estimateCode,
        customerId: cmd.customerId,
        propertyId: cmd.propertyId,
        recommendedCapacityKw: roundedCapacity,
        annualGenerationKwh,
        calculatedAt: now.toISOString(),
      };

      const estimateEnvelope = createEventEnvelope(
        KafkaTopics.ENGINEERING_ESTIMATE_COMPLETED,
        'aethra-engineering-service',
        {
          organisationId: cmd.organisationId,
          originatingUserId: cmd.calculatedByUserId,
          correlationId: cmd.correlationId,
        },
        estimatePayload
      );

      await trx
        .insertInto('outbox_events')
        .values({
          id: crypto.randomUUID(),
          event_type: estimateEnvelope.eventType,
          topic: KafkaTopics.ENGINEERING_ESTIMATE_COMPLETED,
          partition_key: cmd.organisationId,
          payload: estimateEnvelope as unknown as Record<string, unknown>,
          correlation_id: cmd.correlationId,
          status: 'pending',
          retry_count: 0,
          created_at: now,
        })
        .execute();

      // 9. Outbox Event (BOM Generated)
      const bomPayload: EngineeringBomGeneratedEventPayload = {
        bomId,
        bomVersionId,
        estimateId,
        organisationId: cmd.organisationId,
        versionNumber: 1,
        itemCount: bomItems.length,
        generatedAt: now.toISOString(),
      };

      const bomEnvelope = createEventEnvelope(
        KafkaTopics.ENGINEERING_BOM_GENERATED,
        'aethra-engineering-service',
        {
          organisationId: cmd.organisationId,
          originatingUserId: cmd.calculatedByUserId,
          correlationId: cmd.correlationId,
        },
        bomPayload
      );

      await trx
        .insertInto('outbox_events')
        .values({
          id: crypto.randomUUID(),
          event_type: bomEnvelope.eventType,
          topic: KafkaTopics.ENGINEERING_BOM_GENERATED,
          partition_key: cmd.organisationId,
          payload: bomEnvelope as unknown as Record<string, unknown>,
          correlation_id: cmd.correlationId,
          status: 'pending',
          retry_count: 0,
          created_at: now,
        })
        .execute();

      return {
        estimate,
        outputs,
        bom: {
          id: bom.id,
          bomCode: bom.bom_code,
          version: 1,
          items: bomItems,
        },
      };
    });

    logger.info(
      { estimateId: result.estimate.id, code: result.estimate.estimate_code, capacity: roundedCapacity },
      'Engineering estimate and BOM generated'
    );

    return result;
  }

  /**
   * Retrieves an engineering estimate with all inputs, outputs, and assumptions.
   */
  async getEstimateById(organisationId: string, estimateId: string) {
    const estimate = await this.db
      .selectFrom('engineering_estimates')
      .selectAll()
      .where('id', '=', estimateId)
      .where('organisation_id', '=', organisationId)
      .executeTakeFirst();

    if (!estimate) return null;

    const inputs = await this.db
      .selectFrom('engineering_inputs')
      .selectAll()
      .where('estimate_id', '=', estimateId)
      .execute();

    const outputs = await this.db
      .selectFrom('calculation_outputs')
      .selectAll()
      .where('estimate_id', '=', estimateId)
      .execute();

    const assumptions = await this.db
      .selectFrom('calculation_assumptions')
      .selectAll()
      .where('estimate_id', '=', estimateId)
      .execute();

    return {
      ...estimate,
      inputs,
      outputs,
      assumptions,
    };
  }

  /**
   * Retrieves the latest BOM items for an estimate.
   */
  async getBomByEstimateId(organisationId: string, estimateId: string) {
    const bom = await this.db
      .selectFrom('bill_of_materials')
      .selectAll()
      .where('estimate_id', '=', estimateId)
      .where('organisation_id', '=', organisationId)
      .executeTakeFirst();

    if (!bom) return null;

    const version = await this.db
      .selectFrom('bom_versions')
      .selectAll()
      .where('bom_id', '=', bom.id)
      .orderBy('version_number', 'desc')
      .executeTakeFirst();

    if (!version) return null;

    const items = await this.db
      .selectFrom('bom_items')
      .selectAll()
      .where('bom_version_id', '=', version.id)
      .execute();

    return {
      ...bom,
      version: version.version_number,
      items,
    };
  }
}
