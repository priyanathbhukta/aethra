// ==============================================================================
// AETHRA — Document & File Service Main Entrypoint
// ==============================================================================

import crypto from 'node:crypto';
import express, { Request, Response, NextFunction } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';
import { createDatabaseClient } from './database/connection.js';
import { DocumentApplicationService } from './application/document.service.js';

const config = loadAppConfig('document-service', 3014);
const logger = createStructuredLogger('document-service', config.logLevel);

initTracing({ serviceName: 'document-service' });

export const db = createDatabaseClient();
export const documentService = new DocumentApplicationService(db);

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
      service: 'document-service',
      database: 'document_db',
      version: '0.1.0',
    });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: String(err) });
  }
});

// Presigned S3 Upload Session Generator
app.post('/api/v1/documents/upload-sessions', async (req: Request, res: Response) => {
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;

  try {
    const session = await documentService.createUploadSession({
      ...req.body,
      organisationId,
    });

    res.status(201).json({ success: true, data: session });
    return;
  } catch (err: any) {
    logger.error({ err }, 'Failed to create upload session');
    res.status(400).json({ error: err.message });
    return;
  }
});

// Confirm Upload Completion
app.post('/api/v1/documents/confirm-upload', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const userId = (req.headers['x-user-id'] as string) || 'system';

  try {
    const file = await documentService.confirmUpload({
      ...req.body,
      uploadedByUserId: userId,
      correlationId,
    });

    res.status(201).json({ success: true, data: file });
    return;
  } catch (err: any) {
    logger.error({ err, correlationId }, 'Failed to confirm upload');
    res.status(400).json({ error: err.message });
    return;
  }
});

// Generate Time-Limited HMAC Download URL (Scenario 12)
app.get('/api/v1/documents/:id/download-url', async (req: Request, res: Response) => {
  const organisationId = (req.headers['x-tenant-id'] as string) || (req.query.organisationId as string);
  const userId = (req.headers['x-user-id'] as string) || 'anonymous';
  const permissionsHeader = (req.headers['x-user-permissions'] as string) || '';
  const permissions = permissionsHeader ? permissionsHeader.split(',') : [];
  const isCustomerUser = req.headers['x-user-type'] === 'customer';

  try {
    const download = await documentService.generateDownloadUrl({
      fileId: req.params.id,
      organisationId,
      requestingUserId: userId,
      userPermissions: permissions,
      isCustomerUser,
    });

    res.status(200).json({ success: true, data: download });
    return;
  } catch (err: any) {
    logger.warn({ err, fileId: req.params.id }, 'Download authorization failed');
    res.status(403).json({ error: err.message });
    return;
  }
});

const PORT = config.port || 3014;
app.listen(PORT, () => {
  logger.info(`[Document Service] Running on port ${PORT}`);
});

export default app;
