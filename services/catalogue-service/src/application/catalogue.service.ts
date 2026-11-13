// ==============================================================================
// AETHRA Product Catalogue Service — Application Domain Service
// ==============================================================================

import crypto from 'node:crypto';
import { Kysely } from 'kysely';
import { CatalogueDatabaseSchema } from '../database/connection.js';
import {
  KafkaTopics,
  createEventEnvelope,
  CataloguePriceUpdatedEventPayload,
} from '@aethra/event-contracts';
import { createStructuredLogger } from '@aethra/observability';
import { CreateProductModelDto, SetVendorPricingDto } from '@aethra/api-contracts';

const logger = createStructuredLogger('catalogue-service');

export interface CreateProductModelCommand extends CreateProductModelDto {
  correlationId?: string;
}

export interface SetVendorPricingCommand extends SetVendorPricingDto {
  correlationId: string;
}

export class CatalogueApplicationService {
  constructor(private readonly db: Kysely<CatalogueDatabaseSchema>) {}

  /**
   * Registers a new equipment product model into the global master catalogue.
   */
  async createProductModel(cmd: CreateProductModelCommand) {
    const modelId = crypto.randomUUID();
    const now = new Date();

    const model = await this.db
      .insertInto('product_models')
      .values({
        id: modelId,
        category_id: cmd.categoryId,
        brand_id: cmd.brandId,
        model_code: cmd.modelCode.trim(),
        display_name: cmd.displayName.trim(),
        description: cmd.description ? cmd.description.trim() : null,
        is_discontinued: false,
        metadata: cmd.metadata || null,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    logger.info({ modelId: model.id, modelCode: model.model_code }, 'Created product model');
    return model;
  }

  /**
   * Configures vendor-specific SKU, confidential procurement cost, margin, and standard selling price.
   * Dispatches catalogue.price.updated.v1 outbox event.
   */
  async setVendorPricing(cmd: SetVendorPricingCommand) {
    const minPrice = cmd.minSellingPrice !== undefined ? cmd.minSellingPrice : cmd.standardSellingPrice;
    if (minPrice > cmd.standardSellingPrice) {
      throw new Error(`Invalid pricing: minSellingPrice (${minPrice}) cannot exceed standardSellingPrice (${cmd.standardSellingPrice})`);
    }

    const existing = await this.db
      .selectFrom('vendor_catalogue_entries')
      .selectAll()
      .where('organisation_id', '=', cmd.organisationId)
      .where('model_id', '=', cmd.modelId)
      .executeTakeFirst();

    const now = new Date();
    const oldPrice = existing ? Number(existing.standard_selling_price) : 0;

    const result = await this.db.transaction().execute(async (trx) => {
      let entry;
      if (existing) {
        entry = await trx
          .updateTable('vendor_catalogue_entries')
          .set({
            vendor_sku: cmd.vendorSku.trim(),
            standard_cost_price: cmd.standardCostPrice,
            standard_selling_price: cmd.standardSellingPrice,
            min_selling_price: minPrice,
            tax_rate_percent: cmd.taxRatePercent !== undefined ? cmd.taxRatePercent : 13.8,
            is_available: cmd.isAvailable !== undefined ? cmd.isAvailable : true,
            updated_at: now,
          })
          .where('id', '=', existing.id)
          .returningAll()
          .executeTakeFirstOrThrow();
      } else {
        const entryId = crypto.randomUUID();
        entry = await trx
          .insertInto('vendor_catalogue_entries')
          .values({
            id: entryId,
            organisation_id: cmd.organisationId,
            model_id: cmd.modelId,
            vendor_sku: cmd.vendorSku.trim(),
            standard_cost_price: cmd.standardCostPrice,
            standard_selling_price: cmd.standardSellingPrice,
            min_selling_price: minPrice,
            tax_rate_percent: cmd.taxRatePercent !== undefined ? cmd.taxRatePercent : 13.8,
            is_available: cmd.isAvailable !== undefined ? cmd.isAvailable : true,
            is_preferred: false,
            lead_time_days: 3,
            vendor_notes: null,
            created_at: now,
            updated_at: now,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
      }

      // Outbox Event
      const outboxPayload: CataloguePriceUpdatedEventPayload = {
        catalogueEntryId: entry.id,
        organisationId: cmd.organisationId,
        modelId: cmd.modelId,
        vendorSku: entry.vendor_sku,
        oldStandardSellingPrice: oldPrice,
        newStandardSellingPrice: Number(entry.standard_selling_price),
        updatedAt: now.toISOString(),
      };

      const envelope = createEventEnvelope(
        KafkaTopics.CATALOGUE_PRICE_UPDATED,
        'aethra-catalogue-service',
        {
          organisationId: cmd.organisationId,
          correlationId: cmd.correlationId,
        },
        outboxPayload
      );

      await trx
        .insertInto('outbox_events')
        .values({
          id: crypto.randomUUID(),
          event_type: envelope.eventType,
          topic: KafkaTopics.CATALOGUE_PRICE_UPDATED,
          partition_key: cmd.organisationId,
          payload: envelope as unknown as Record<string, unknown>,
          correlation_id: cmd.correlationId,
          status: 'pending',
          retry_count: 0,
          created_at: now,
        })
        .execute();

      return entry;
    });

    logger.info(
      { entryId: result.id, sku: result.vendor_sku, price: result.standard_selling_price },
      'Vendor catalogue entry saved and event queued'
    );
    return result;
  }

  /**
   * Retrieves catalogue models, merged with vendor-specific pricing if organisationId is provided.
   */
  async getCatalogue(organisationId?: string, filters?: { categoryCode?: string; brandId?: string }) {
    let query = this.db
      .selectFrom('product_models as pm')
      .innerJoin('product_categories as pc', 'pc.id', 'pm.category_id')
      .innerJoin('brands as b', 'b.id', 'pm.brand_id')
      .selectAll('pm')
      .select(['pc.code as category_code', 'pc.name as category_name', 'b.name as brand_name']);

    if (filters?.categoryCode) {
      query = query.where('pc.code', '=', filters.categoryCode);
    }
    if (filters?.brandId) {
      query = query.where('pm.brand_id', '=', filters.brandId);
    }

    const models = await query.where('pm.is_discontinued', '=', false).execute();

    if (!organisationId || models.length === 0) {
      return models;
    }

    // Attach vendor pricing if organisation provided
    const modelIds = models.map((m) => m.id);
    const vendorEntries = await this.db
      .selectFrom('vendor_catalogue_entries')
      .selectAll()
      .where('organisation_id', '=', organisationId)
      .where('model_id', 'in', modelIds)
      .execute();

    const entryMap = new Map(vendorEntries.map((e) => [e.model_id, e]));

    return models.map((m) => ({
      ...m,
      vendorPricing: entryMap.get(m.id) || null,
    }));
  }

  /**
   * Retrieves full details for a product model including specs, warranty, and optional vendor entry.
   */
  async getModelDetails(modelId: string, organisationId?: string) {
    const model = await this.db
      .selectFrom('product_models as pm')
      .innerJoin('product_categories as pc', 'pc.id', 'pm.category_id')
      .innerJoin('brands as b', 'b.id', 'pm.brand_id')
      .selectAll('pm')
      .select(['pc.code as category_code', 'pc.name as category_name', 'b.name as brand_name'])
      .where('pm.id', '=', modelId)
      .executeTakeFirst();

    if (!model) return null;

    const specs = await this.db
      .selectFrom('specification_values as sv')
      .innerJoin('product_specifications as ps', 'ps.id', 'sv.spec_id')
      .leftJoin('units as u', 'u.id', 'sv.unit_id')
      .select(['ps.spec_key', 'ps.label', 'sv.text_value', 'sv.numeric_value', 'u.code as unit_code'])
      .where('sv.model_id', '=', modelId)
      .execute();

    const warranty = await this.db
      .selectFrom('warranty_templates')
      .selectAll()
      .where('model_id', '=', modelId)
      .executeTakeFirst();

    let vendorEntry = null;
    if (organisationId) {
      vendorEntry = await this.db
        .selectFrom('vendor_catalogue_entries')
        .selectAll()
        .where('organisation_id', '=', organisationId)
        .where('model_id', '=', modelId)
        .executeTakeFirst();
    }

    return {
      ...model,
      specifications: specs,
      warranty: warranty || null,
      vendorPricing: vendorEntry || null,
    };
  }
}
