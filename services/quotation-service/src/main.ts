// ==============================================================================
// AETHRA — Quotation Service Main Entrypoint
// ==============================================================================

import crypto from 'node:crypto';
import express, { Request, Response, NextFunction } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';
import { createDatabaseClient } from './database/connection.js';
import { QuotationApplicationService } from './application/quotation.service.js';

const config = loadAppConfig('quotation-service', 3010);
const logger = createStructuredLogger('quotation-service', config.logLevel);

initTracing({ serviceName: 'quotation-service' });

export const db = createDatabaseClient();
export const quotationService = new QuotationApplicationService(db);

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
      service: 'quotation-service',
      database: 'quotation_db',
      version: '0.1.0',
    });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: String(err) });
  }
});

// Create Quotation with Revision 1 (Draft)
app.post('/api/v1/quotations', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;
  const userId = (req.headers['x-user-id'] as string) || 'system';

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID (x-tenant-id header or body)' });
      return;
    }

    const result = await quotationService.createQuotation({
      ...req.body,
      organisationId,
      createdByUserId: userId,
      correlationId,
    });

    res.status(201).json({ success: true, data: result });
    return;
  } catch (err: any) {
    logger.error({ err, correlationId }, 'Failed to create quotation');
    res.status(400).json({ error: err.message || 'Quotation creation failed' });
    return;
  }
});

// Get Quotation by ID
app.get('/api/v1/quotations/:id', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || (req.query.organisationId as string);

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID' });
      return;
    }

    const quotation = await quotationService.getQuotationById(organisationId, req.params.id);
    if (!quotation) {
      res.status(404).json({ error: 'Quotation not found' });
      return;
    }

    res.status(200).json({ success: true, data: quotation });
    return;
  } catch (err: any) {
    logger.error({ err, correlationId }, 'Failed to fetch quotation');
    res.status(500).json({ error: err.message });
    return;
  }
});

// Issue Quotation Revision (Freezes revision)
app.post('/api/v1/quotations/:id/revisions/:revisionId/issue', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID' });
      return;
    }

    const issued = await quotationService.issueQuotationRevision({
      organisationId,
      quotationId: req.params.id,
      revisionId: req.params.revisionId,
      correlationId,
    });

    res.status(200).json({
      success: true,
      message: 'Quotation revision successfully issued and frozen',
      data: issued,
    });
    return;
  } catch (err: any) {
    logger.error({ err, correlationId }, 'Failed to issue quotation revision');
    res.status(400).json({ error: err.message });
    return;
  }
});

// Create new revision (Revision n + 1)
app.post('/api/v1/quotations/:id/revisions', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;
  const userId = (req.headers['x-user-id'] as string) || 'system';

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID' });
      return;
    }

    const newRev = await quotationService.createQuotationRevision({
      organisationId,
      quotationId: req.params.id,
      validDays: req.body.validDays,
      lines: req.body.lines,
      notesCustomer: req.body.notesCustomer,
      notesInternal: req.body.notesInternal,
      createdByUserId: userId,
      correlationId,
    });

    res.status(201).json({
      success: true,
      data: newRev,
    });
    return;
  } catch (err: any) {
    logger.error({ err, correlationId }, 'Failed to create quotation revision');
    res.status(400).json({ error: err.message });
    return;
  }
});

// Customer Accept Quotation
app.post('/api/v1/quotations/:id/revisions/:revisionId/accept', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;
  const customerUserId = (req.headers['x-user-id'] as string) || req.body.customerUserId;

  try {
    if (!organisationId || !customerUserId) {
      res.status(400).json({ error: 'Missing organisation ID or customer user ID' });
      return;
    }

    await quotationService.acceptQuotation({
      organisationId,
      quotationId: req.params.id,
      revisionId: req.params.revisionId,
      customerUserId,
      signatureType: req.body.signatureType || 'digital_click',
      signatureToken: req.body.signatureToken,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.get('user-agent') || 'AETHRA-Client',
      correlationId,
    });

    res.status(200).json({
      success: true,
      message: 'Quotation accepted and downstream project initialization saga triggered',
    });
    return;
  } catch (err: any) {
    logger.error({ err, correlationId }, 'Failed to accept quotation');
    res.status(400).json({ error: err.message });
    return;
  }
});

const PORT = config.port || 3010;
app.listen(PORT, () => {
  logger.info(`[Quotation Service] Running on port ${PORT}`);
});

export default app;
