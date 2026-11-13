// ==============================================================================
// AETHRA — Integration Service Main Entrypoint
// ==============================================================================

import crypto from 'node:crypto';
import express, { Request, Response, NextFunction } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';
import { createDatabaseClient } from './database/connection.js';
import { IntegrationApplicationService } from './application/integration.service.js';

const config = loadAppConfig('integration-service', 3018);
const logger = createStructuredLogger('integration-service', config.logLevel);

initTracing({ serviceName: 'integration-service' });

export const db = createDatabaseClient();
export const integrationService = new IntegrationApplicationService(db);

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
      service: 'integration-service',
      database: 'integration_db',
      version: '0.1.0',
    });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: String(err) });
  }
});

// Register Integration Connection
app.post('/api/v1/integrations/connections', async (req: Request, res: Response) => {
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID' });
      return;
    }

    const connection = await integrationService.createConnection({
      ...req.body,
      organisationId,
    });

    res.status(201).json({ success: true, data: connection });
    return;
  } catch (err: any) {
    logger.error({ err }, 'Failed to create integration connection');
    res.status(400).json({ error: err.message });
    return;
  }
});

// Idempotent Webhook Intake Endpoint
app.post('/api/v1/integrations/webhooks/intake', async (req: Request, res: Response) => {
  const endpointPath = (req.query.path as string) || '/api/v1/integrations/webhooks/intake';
  const eventIdHeader = req.headers['x-webhook-event-id'] as string | undefined;

  try {
    const result = await integrationService.handleWebhookIntake({
      endpointPath,
      payload: req.body,
      eventIdHeader,
    });

    res.status(200).json(result);
    return;
  } catch (err: any) {
    logger.error({ err }, 'Webhook intake failed');
    res.status(400).json({ error: err.message });
    return;
  }
});

// Update Telemetry Sync Cursor
app.post('/api/v1/integrations/telemetry/sync', async (req: Request, res: Response) => {
  const { connectionId, syncDomain, lastCursor, recordsProcessed } = req.body;

  try {
    const sync = await integrationService.recordTelemetrySync(
      connectionId,
      syncDomain,
      lastCursor,
      Number(recordsProcessed) || 0
    );

    res.status(200).json({ success: true, data: sync });
    return;
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }
});

const PORT = config.port || 3018;
app.listen(PORT, () => {
  logger.info(`[Integration Service] Running on port ${PORT}`);
});

export default app;
