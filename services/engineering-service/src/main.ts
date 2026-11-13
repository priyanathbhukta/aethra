// ==============================================================================
// AETHRA — Engineering & Estimation Service Main Entrypoint
// ==============================================================================

import express, { Request, Response, NextFunction } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';
import { createDatabaseClient } from './database/connection.js';
import { EngineeringApplicationService } from './application/engineering.service.js';

const config = loadAppConfig('engineering-service', 3009);
const logger = createStructuredLogger('engineering-service', config.logLevel);

initTracing({ serviceName: 'engineering-service' });

export const db = createDatabaseClient();
export const engineeringService = new EngineeringApplicationService(db);

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
      service: 'engineering-service',
      database: 'engineering_db',
      version: '0.1.0',
    });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: String(err) });
  }
});

// Run Engineering Estimate
app.post('/api/v1/engineering/estimates', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;
  const userId = (req.headers['x-user-id'] as string) || 'system';
  const {
    customerId,
    propertyId,
    leadId,
    profileCode,
    sanctionLoadKw,
    usableAreaSqm,
    tiltAngleDeg,
    azimuthDeg,
    discomMonthlyUnits,
  } = req.body;

  if (!organisationId || !sanctionLoadKw || !usableAreaSqm) {
    res.status(400).json({
      type: 'https://api.aethra.energy/errors/invalid-request',
      title: 'Bad Request',
      status: 400,
      detail: 'organisationId, sanctionLoadKw, and usableAreaSqm are required',
      code: 'ERR_MISSING_ENGINEERING_FIELDS',
      correlationId,
    });
    return;
  }

  try {
    const result = await engineeringService.runEstimate({
      organisationId,
      customerId,
      propertyId,
      leadId,
      profileCode,
      sanctionLoadKw: Number(sanctionLoadKw),
      usableAreaSqm: Number(usableAreaSqm),
      tiltAngleDeg: tiltAngleDeg ? Number(tiltAngleDeg) : undefined,
      azimuthDeg: azimuthDeg ? Number(azimuthDeg) : undefined,
      discomMonthlyUnits: discomMonthlyUnits ? Number(discomMonthlyUnits) : undefined,
      calculatedByUserId: userId,
      correlationId,
    });

    res.status(201).json({
      success: true,
      data: result,
      meta: { correlationId, calculatedAt: result.estimate.calculated_at },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to run engineering estimate');
    res.status(500).json({ error: 'Failed to run engineering estimate', detail: String(err) });
  }
});

// Get Estimate Details
app.get('/api/v1/engineering/estimates/:id', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || (req.query.organisationId as string);
  const { id } = req.params;

  if (!organisationId) {
    res.status(400).json({ error: 'Missing organisation context' });
    return;
  }

  try {
    const estimate = await engineeringService.getEstimateById(organisationId, id);
    if (!estimate) {
      res.status(404).json({ error: 'Engineering estimate not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: estimate,
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to fetch engineering estimate');
    res.status(500).json({ error: 'Internal server error fetching estimate' });
  }
});

// Get BOM by Estimate ID
app.get('/api/v1/engineering/estimates/:id/bom', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || (req.query.organisationId as string);
  const { id } = req.params;

  if (!organisationId) {
    res.status(400).json({ error: 'Missing organisation context' });
    return;
  }

  try {
    const bom = await engineeringService.getBomByEstimateId(organisationId, id);
    if (!bom) {
      res.status(404).json({ error: 'Bill of Materials not found for this estimate' });
      return;
    }

    res.status(200).json({
      success: true,
      data: bom,
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to fetch BOM');
    res.status(500).json({ error: 'Internal server error fetching BOM' });
  }
});

const PORT = config.port || 3009;
app.listen(PORT, () => {
  logger.info(`[Engineering Service] Running on port ${PORT}`);
});

export default app;
