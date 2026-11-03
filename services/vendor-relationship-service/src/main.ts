// ==============================================================================
// AETHRA — Vendor Relationship Service Main Entrypoint
// ==============================================================================

import express, { Request, Response } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';

const config = loadAppConfig('vendor-relationship-service', 3006);
const logger = createStructuredLogger('vendor-relationship-service', config.logLevel);

initTracing({ serviceName: 'vendor-relationship-service' });

const app = express();
app.use(express.json());

// Health Probes
app.get('/health/live', (_req, res) => res.status(200).json({ status: 'live' }));
app.get('/health/ready', (_req, res) => {
  res.status(200).json({
    status: 'ready',
    service: 'vendor-relationship-service',
    database: 'vendor_relationship_db',
    version: '0.1.0',
  });
});

// Revoke Relationship Access Grant
app.post('/api/v1/relationships/:id/revoke', (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason, revokedByUserId } = req.body;

  logger.warn({ relationshipId: id, reason, revokedByUserId }, 'Revoking vendor-customer relationship');

  res.status(200).json({
    success: true,
    data: {
      relationshipId: id,
      status: 'revoked',
      revokedAt: new Date().toISOString(),
      reason: reason || 'Customer requested termination',
    },
  });
});

const PORT = config.port || 3006;
app.listen(PORT, () => {
  logger.info(`[Vendor Relationship Service] Running on port ${PORT}`);
});

export default app;
