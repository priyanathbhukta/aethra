// ==============================================================================
// AETHRA — Reporting & Analytics Service Main Entrypoint
// ==============================================================================

import crypto from 'node:crypto';
import express, { Request, Response, NextFunction } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';
import { createDatabaseClient } from './database/connection.js';
import { ReportingApplicationService } from './application/reporting.service.js';

const config = loadAppConfig('reporting-service', 3017);
const logger = createStructuredLogger('reporting-service', config.logLevel);

initTracing({ serviceName: 'reporting-service' });

export const db = createDatabaseClient();
export const reportingService = new ReportingApplicationService(db);

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
app.get('/health/live', (_req, res) => {
  res.status(200).json({ status: 'live' });
});

app.get('/health/ready', async (_req, res) => {
  try {
    res.status(200).json({
      status: 'ready',
      service: 'reporting-service',
      database: 'reporting_db',
      version: '0.1.0',
    });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: String(err) });
  }
});

// Get Analytical Read Projection
app.get('/api/v1/reporting/projections/:type', async (req: Request, res: Response) => {
  const organisationId = (req.headers['x-tenant-id'] as string) || (req.query.organisationId as string);

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID' });
      return;
    }

    const projection = await reportingService.getReportProjection(organisationId, req.params.type);
    res.status(200).json({ success: true, data: projection });
    return;
  } catch (err: any) {
    logger.error({ err }, 'Failed to fetch read projection');
    res.status(500).json({ error: err.message });
    return;
  }
});

// Enqueue Async Export Job
app.post('/api/v1/reporting/exports', async (req: Request, res: Response) => {
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;
  const userId = (req.headers['x-user-id'] as string) || 'system';

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID' });
      return;
    }

    const job = await reportingService.enqueueExportJob({
      organisationId,
      reportCode: req.body.reportCode,
      requestedByUserId: userId,
      filterParameters: req.body.filterParameters,
      exportFormat: req.body.exportFormat,
    });

    res.status(202).json({ success: true, data: job });
    return;
  } catch (err: any) {
    logger.error({ err }, 'Failed to enqueue export job');
    res.status(400).json({ error: err.message });
    return;
  }
});

// Get Export Job Status
app.get('/api/v1/reporting/exports/:id', async (req: Request, res: Response) => {
  const organisationId = (req.headers['x-tenant-id'] as string) || (req.query.organisationId as string);

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID' });
      return;
    }

    const job = await reportingService.getExportJob(organisationId, req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Export job not found' });
      return;
    }

    res.status(200).json({ success: true, data: job });
    return;
  } catch (err: any) {
    res.status(500).json({ error: err.message });
    return;
  }
});

const PORT = config.port || 3017;
app.listen(PORT, () => {
  logger.info(`[Reporting Service] Running on port ${PORT}`);
});

export default app;
