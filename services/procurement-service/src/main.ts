// ==============================================================================
// AETHRA — Procurement Service Main Entrypoint
// ==============================================================================

import express, { Request, Response } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';

const config = loadAppConfig('procurement-service', 3012);
const logger = createStructuredLogger('procurement-service', config.logLevel);

initTracing({ serviceName: 'procurement-service' });

const app = express();
app.use(express.json());

app.get('/health/live', (_req, res) => res.status(200).json({ status: 'live' }));
app.get('/health/ready', (_req, res) => {
  res.status(200).json({ status: 'ready', service: 'procurement-service', database: 'procurement_db', version: '0.1.0' });
});

app.post('/api/v1/procurement/purchase-orders', (req: Request, res: Response) => {
  const { supplierId, totalAmount } = req.body;
  const poId = crypto.randomUUID();
  logger.info({ poId, supplierId, totalAmount }, 'Created supplier purchase order');
  res.status(201).json({
    success: true,
    data: {
      id: poId,
      poNumber: 'PO-2026-0001',
      supplierId,
      status: 'draft',
      totalAmount: totalAmount || 0,
      createdAt: new Date().toISOString(),
    },
  });
});

const PORT = config.port || 3012;
app.listen(PORT, () => {
  logger.info(`[Procurement Service] Running on port ${PORT}`);
});

export default app;
