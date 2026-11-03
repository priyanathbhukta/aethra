// ==============================================================================
// AETHRA — Organisation & Tenant Service Main Entrypoint
// ==============================================================================

import express, { Request, Response } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';
import { createDatabaseClient } from './database/connection.js';

const config = loadAppConfig('organisation-service', 3002);
const logger = createStructuredLogger('organisation-service', config.logLevel);

initTracing({ serviceName: 'organisation-service' });

const app = express();
app.use(express.json());

export const db = createDatabaseClient();

// Health Probes
app.get('/health/live', (_req, res) => res.status(200).json({ status: 'live' }));
app.get('/health/ready', (_req, res) => {
  res.status(200).json({
    status: 'ready',
    service: 'organisation-service',
    database: 'organisation_db',
    version: '0.1.0',
  });
});

// Organisation Creation
app.post('/api/v1/organisations', (req: Request, res: Response) => {
  const { legalName, businessCategories } = req.body;
  if (!legalName) {
    res.status(400).json({ error: 'legalName is required' });
    return;
  }
  const orgId = crypto.randomUUID();
  logger.info({ orgId, legalName }, 'Vendor organisation created');
  res.status(201).json({
    success: true,
    data: {
      id: orgId,
      legalName,
      businessCategories: businessCategories || ['solar_epc'],
      status: 'trial',
      createdAt: new Date().toISOString(),
    },
  });
});

const PORT = config.port || 3002;
app.listen(PORT, () => {
  logger.info(`[Organisation Service] Running on port ${PORT}`);
});

export default app;
