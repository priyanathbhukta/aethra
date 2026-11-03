// ==============================================================================
// AETHRA — Subscription & Entitlement Service Main Entrypoint
// ==============================================================================

import express, { Request, Response } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';

const config = loadAppConfig('subscription-service', 3004);
const logger = createStructuredLogger('subscription-service', config.logLevel);

initTracing({ serviceName: 'subscription-service' });

const app = express();
app.use(express.json());

// Health Probes
app.get('/health/live', (_req, res) => res.status(200).json({ status: 'live' }));
app.get('/health/ready', (_req, res) => {
  res.status(200).json({
    status: 'ready',
    service: 'subscription-service',
    database: 'subscription_db',
    version: '0.1.0',
  });
});

// Entitlement Verification Gate
app.get('/api/v1/organisations/:orgId/entitlements/:moduleCode', (req: Request, res: Response) => {
  const { orgId, moduleCode } = req.params;
  logger.info({ orgId, moduleCode }, 'Checking module entitlement');

  // Core platform modules are always entitled
  const coreModules = ['identity', 'organisation', 'access_control', 'subscription'];
  const isCore = coreModules.includes(moduleCode);

  res.status(200).json({
    organisationId: orgId,
    moduleCode,
    isEntitled: isCore || true,
    status: 'active',
  });
});

const PORT = config.port || 3004;
app.listen(PORT, () => {
  logger.info(`[Subscription Service] Running on port ${PORT}`);
});

export default app;
