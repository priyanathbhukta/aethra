// ==============================================================================
// AETHRA — Web Backend-for-Frontend (BFF) Main Entrypoint
// ==============================================================================

import express, { Request, Response } from 'express';
import { createStructuredLogger } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';

const config = loadAppConfig('web-bff', 8001);
const logger = createStructuredLogger('web-bff', config.logLevel);

const app = express();
app.use(express.json());

// Health Probes
app.get('/health/live', (_req, res) => res.status(200).json({ status: 'live' }));
app.get('/health/ready', (_req, res) => res.status(200).json({ status: 'ready', service: 'web-bff' }));

// Aggregated Desktop Dashboard Endpoint
app.get('/api/v1/web/dashboard', (req: Request, res: Response) => {
  const tenantId = req.headers['x-tenant-id'] as string;
  res.status(200).json({
    success: true,
    data: {
      overview: {
        activeProjectsCount: 12,
        pipelineLeadsCount: 45,
        monthlyRevenueInr: 5400000,
        lowStockItemsCount: 3,
      },
      tenantId: tenantId || 'anonymous',
    },
    meta: {
      timestamp: new Date().toISOString(),
      correlationId: (req.headers['x-correlation-id'] as string) || crypto.randomUUID(),
    },
  });
});

const PORT = config.port || 8001;
app.listen(PORT, () => {
  logger.info(`[Web BFF] Server running on port ${PORT}`);
});

export default app;
