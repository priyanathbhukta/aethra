// ==============================================================================
// AETHRA — Product Catalogue Service Main Entrypoint
// ==============================================================================

import express, { Request, Response, NextFunction } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';
import { createDatabaseClient } from './database/connection.js';
import { CatalogueApplicationService } from './application/catalogue.service.js';

const config = loadAppConfig('catalogue-service', 3008);
const logger = createStructuredLogger('catalogue-service', config.logLevel);

initTracing({ serviceName: 'catalogue-service' });

export const db = createDatabaseClient();
export const catalogueService = new CatalogueApplicationService(db);

const app = express();
app.use(express.json());

// Correlation ID Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
  req.headers['x-correlation-id'] = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  next();
});

// Health Probes
app.get('/health/live', (_req, res) => res.status(200).json({ status: 'live' }));
app.get('/health/ready', async (_req, res) => {
  try {
    res.status(200).json({
      status: 'ready',
      service: 'catalogue-service',
      database: 'catalogue_db',
      version: '0.1.0',
    });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: String(err) });
  }
});

// List Product Models
app.get('/api/v1/catalogue/models', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || (req.query.organisationId as string);
  const { categoryCode, brandId } = req.query;

  try {
    const models = await catalogueService.getCatalogue(organisationId, {
      categoryCode: categoryCode as string,
      brandId: brandId as string,
    });

    res.status(200).json({
      success: true,
      data: models,
      meta: { correlationId, count: models.length },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to list product models');
    res.status(500).json({ error: 'Internal server error listing models' });
  }
});

// Get Model Details
app.get('/api/v1/catalogue/models/:id', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || (req.query.organisationId as string);
  const { id } = req.params;

  try {
    const model = await catalogueService.getModelDetails(id, organisationId);
    if (!model) {
      res.status(404).json({ error: 'Product model not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: model,
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to fetch product model details');
    res.status(500).json({ error: 'Internal server error fetching model' });
  }
});

// Create Product Model (Platform / Master Catalogue)
app.post('/api/v1/catalogue/models', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { categoryId, brandId, modelCode, displayName, description, metadata } = req.body;

  if (!categoryId || !brandId || !modelCode || !displayName) {
    res.status(400).json({
      type: 'https://api.aethra.energy/errors/invalid-request',
      title: 'Bad Request',
      status: 400,
      detail: 'categoryId, brandId, modelCode, and displayName are required',
      code: 'ERR_MISSING_MODEL_FIELDS',
      correlationId,
    });
    return;
  }

  try {
    const model = await catalogueService.createProductModel({
      categoryId,
      brandId,
      modelCode,
      displayName,
      description,
      metadata,
      correlationId,
    });

    res.status(201).json({
      success: true,
      data: model,
      meta: { correlationId, createdAt: model.created_at },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to create product model');
    res.status(500).json({ error: 'Failed to create product model', detail: String(err) });
  }
});

// Set Vendor Pricing & Margins
app.post('/api/v1/catalogue/vendor-entries', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;
  const {
    modelId,
    vendorSku,
    standardCostPrice,
    standardSellingPrice,
    minSellingPrice,
    taxRatePercent,
    isAvailable,
  } = req.body;

  if (!organisationId || !modelId || !vendorSku || standardCostPrice === undefined || standardSellingPrice === undefined) {
    res.status(400).json({
      type: 'https://api.aethra.energy/errors/invalid-request',
      title: 'Bad Request',
      status: 400,
      detail: 'organisationId, modelId, vendorSku, standardCostPrice, and standardSellingPrice are required',
      code: 'ERR_MISSING_PRICING_FIELDS',
      correlationId,
    });
    return;
  }

  try {
    const entry = await catalogueService.setVendorPricing({
      organisationId,
      modelId,
      vendorSku,
      standardCostPrice: Number(standardCostPrice),
      standardSellingPrice: Number(standardSellingPrice),
      minSellingPrice: minSellingPrice !== undefined ? Number(minSellingPrice) : undefined,
      taxRatePercent: taxRatePercent !== undefined ? Number(taxRatePercent) : undefined,
      isAvailable,
      correlationId,
    });

    res.status(200).json({
      success: true,
      data: entry,
      meta: { correlationId, updatedAt: entry.updated_at },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to set vendor pricing');
    res.status(500).json({ error: 'Failed to set vendor pricing', detail: String(err) });
  }
});

const PORT = config.port || 3008;
app.listen(PORT, () => {
  logger.info(`[Catalogue Service] Running on port ${PORT}`);
});

export default app;
