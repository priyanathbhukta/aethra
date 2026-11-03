// ==============================================================================
// AETHRA — Inventory Service Main Entrypoint
// ==============================================================================

import express, { Request, Response } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';

const config = loadAppConfig('inventory-service', 3011);
const logger = createStructuredLogger('inventory-service', config.logLevel);

initTracing({ serviceName: 'inventory-service' });

const app = express();
app.use(express.json());

// Health Probes
app.get('/health/live', (_req, res) => res.status(200).json({ status: 'live' }));
app.get('/health/ready', (_req, res) => {
  res.status(200).json({
    status: 'ready',
    service: 'inventory-service',
    database: 'inventory_db',
    version: '0.1.0',
  });
});

// Append-only Stock Movement Posting
app.post('/api/v1/inventory/movements', (req: Request, res: Response) => {
  const { warehouseId, catalogueProductId, movementType, quantity, unitCost } = req.body;

  if (!warehouseId || !catalogueProductId || !quantity) {
    res.status(400).json({ error: 'warehouseId, catalogueProductId, and quantity are required' });
    return;
  }

  const ledgerEntryId = crypto.randomUUID();
  logger.info({ ledgerEntryId, movementType, quantity }, 'Posting append-only stock movement');

  res.status(201).json({
    success: true,
    data: {
      ledgerEntryId,
      movementType,
      quantity,
      unitCost: unitCost || 0,
      postedAt: new Date().toISOString(),
    },
  });
});

const PORT = config.port || 3011;
app.listen(PORT, () => {
  logger.info(`[Inventory Service] Running on port ${PORT}`);
});

export default app;
