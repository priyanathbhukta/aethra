// ==============================================================================
// AETHRA — Procurement Service Main Entrypoint
// ==============================================================================

import crypto from 'node:crypto';
import express, { Request, Response, NextFunction } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';
import { createDatabaseClient } from './database/connection.js';
import { ProcurementApplicationService } from './application/procurement.service.js';

const config = loadAppConfig('procurement-service', 3012);
const logger = createStructuredLogger('procurement-service', config.logLevel);

initTracing({ serviceName: 'procurement-service' });

export const db = createDatabaseClient();
export const procurementService = new ProcurementApplicationService(db);

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
      service: 'procurement-service',
      database: 'procurement_db',
      version: '0.1.0',
    });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: String(err) });
  }
});

// Register Supplier
app.post('/api/v1/procurement/suppliers', async (req: Request, res: Response) => {
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID' });
      return;
    }

    const supplier = await procurementService.createSupplier({
      ...req.body,
      organisationId,
    });

    res.status(201).json({ success: true, data: supplier });
    return;
  } catch (err: any) {
    logger.error({ err }, 'Failed to create supplier');
    res.status(400).json({ error: err.message });
    return;
  }
});

// Create Purchase Order
app.post('/api/v1/procurement/purchase-orders', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;
  const userId = (req.headers['x-user-id'] as string) || 'system';

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID' });
      return;
    }

    const result = await procurementService.createPurchaseOrder({
      ...req.body,
      organisationId,
      createdByUserId: userId,
      correlationId,
    });

    res.status(201).json({ success: true, data: result });
    return;
  } catch (err: any) {
    logger.error({ err, correlationId }, 'Failed to create purchase order');
    res.status(400).json({ error: err.message });
    return;
  }
});

// Get Purchase Order by ID
app.get('/api/v1/procurement/purchase-orders/:id', async (req: Request, res: Response) => {
  const organisationId = (req.headers['x-tenant-id'] as string) || (req.query.organisationId as string);

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID' });
      return;
    }

    const po = await procurementService.getPurchaseOrderById(organisationId, req.params.id);
    if (!po) {
      res.status(404).json({ error: 'Purchase order not found' });
      return;
    }

    res.status(200).json({ success: true, data: po });
    return;
  } catch (err: any) {
    res.status(500).json({ error: err.message });
    return;
  }
});

// Issue Purchase Order
app.post('/api/v1/procurement/purchase-orders/:id/issue', async (req: Request, res: Response) => {
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID' });
      return;
    }

    const updated = await procurementService.issuePurchaseOrder(organisationId, req.params.id);
    res.status(200).json({ success: true, data: updated });
    return;
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }
});

// Record Goods Receipt (GRN)
app.post('/api/v1/procurement/goods-receipts', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;
  const userId = (req.headers['x-user-id'] as string) || 'system';

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID' });
      return;
    }

    const result = await procurementService.recordGoodsReceipt({
      ...req.body,
      organisationId,
      inspectedByUserId: userId,
      correlationId,
    });

    res.status(201).json({ success: true, data: result });
    return;
  } catch (err: any) {
    logger.error({ err, correlationId }, 'Failed to record goods receipt');
    res.status(400).json({ error: err.message });
    return;
  }
});

// 3-Way Matching Audit
app.post('/api/v1/procurement/purchase-orders/:id/audit-matching', async (req: Request, res: Response) => {
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;
  const invoiceAmount = Number(req.body.invoiceAmount);

  try {
    if (!organisationId || isNaN(invoiceAmount)) {
      res.status(400).json({ error: 'Missing organisation ID or invoiceAmount' });
      return;
    }

    const audit = await procurementService.auditThreeWayMatching(organisationId, req.params.id, invoiceAmount);
    res.status(200).json({ success: true, data: audit });
    return;
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }
});

const PORT = config.port || 3012;
app.listen(PORT, () => {
  logger.info(`[Procurement Service] Running on port ${PORT}`);
});

export default app;
