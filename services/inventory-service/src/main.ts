// ==============================================================================
// AETHRA — Inventory Service Main Entrypoint
// ==============================================================================

import crypto from 'node:crypto';
import express, { Request, Response, NextFunction } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';
import { createDatabaseClient } from './database/connection.js';
import { InventoryApplicationService } from './application/inventory.service.js';

const config = loadAppConfig('inventory-service', 3011);
const logger = createStructuredLogger('inventory-service', config.logLevel);

initTracing({ serviceName: 'inventory-service' });

export const db = createDatabaseClient();
export const inventoryService = new InventoryApplicationService(db);

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
      service: 'inventory-service',
      database: 'inventory_db',
      version: '0.1.0',
    });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: String(err) });
  }
});

// Register Warehouse
app.post('/api/v1/inventory/warehouses', async (req: Request, res: Response) => {
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID' });
      return;
    }

    const warehouse = await inventoryService.registerWarehouse({
      ...req.body,
      organisationId,
    });

    res.status(201).json({ success: true, data: warehouse });
    return;
  } catch (err: any) {
    logger.error({ err }, 'Failed to register warehouse');
    res.status(400).json({ error: err.message });
    return;
  }
});

// Post Append-Only Stock Movement (Receipt, Issue, Transfer, Adjustment)
app.post('/api/v1/inventory/movements', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;
  const userId = (req.headers['x-user-id'] as string) || 'system';

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID' });
      return;
    }

    const result = await inventoryService.postStockMovement({
      ...req.body,
      organisationId,
      createdByUserId: userId,
      correlationId,
    });

    res.status(201).json({ success: true, data: result });
    return;
  } catch (err: any) {
    logger.error({ err, correlationId }, 'Failed to post stock movement');
    res.status(400).json({ error: err.message });
    return;
  }
});

// Reserve Stock for Project
app.post('/api/v1/inventory/reservations', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID' });
      return;
    }

    const reservation = await inventoryService.reserveStock({
      ...req.body,
      organisationId,
      correlationId,
    });

    res.status(201).json({ success: true, data: reservation });
    return;
  } catch (err: any) {
    logger.error({ err, correlationId }, 'Failed to reserve stock');
    res.status(400).json({ error: err.message });
    return;
  }
});

// List Balances
app.get('/api/v1/inventory/balances', async (req: Request, res: Response) => {
  const organisationId = (req.headers['x-tenant-id'] as string) || (req.query.organisationId as string);
  const warehouseId = req.query.warehouseId as string | undefined;

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID' });
      return;
    }

    const balances = await inventoryService.listBalances(organisationId, warehouseId);
    res.status(200).json({ success: true, data: balances });
    return;
  } catch (err: any) {
    res.status(500).json({ error: err.message });
    return;
  }
});

// Get Specific Stock Balance
app.get('/api/v1/inventory/balances/:warehouseId/:productId', async (req: Request, res: Response) => {
  const organisationId = (req.headers['x-tenant-id'] as string) || (req.query.organisationId as string);

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID' });
      return;
    }

    const balance = await inventoryService.getStockBalance(
      organisationId,
      req.params.warehouseId,
      req.params.productId
    );

    if (!balance) {
      res.status(404).json({ error: 'Stock balance record not found' });
      return;
    }

    res.status(200).json({ success: true, data: balance });
    return;
  } catch (err: any) {
    res.status(500).json({ error: err.message });
    return;
  }
});

const PORT = config.port || 3011;
app.listen(PORT, () => {
  logger.info(`[Inventory Service] Running on port ${PORT}`);
});

export default app;
