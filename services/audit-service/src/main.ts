// ==============================================================================
// AETHRA — Audit Service Main Entrypoint
// ==============================================================================

import express, { Request, Response, NextFunction } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';
import { createDatabaseClient } from './database/connection.js';
import { AuditApplicationService } from './application/audit.service.js';

const config = loadAppConfig('audit-service', 3019);
const logger = createStructuredLogger('audit-service', config.logLevel);

initTracing({ serviceName: 'audit-service' });

export const db = createDatabaseClient();
export const auditService = new AuditApplicationService(db);

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
app.get('/health/live', (_req, res) => res.status(200).json({ status: 'live' }));
app.get('/health/ready', async (_req, res) => {
  try {
    res.status(200).json({
      status: 'ready',
      service: 'audit-service',
      database: 'audit_db',
      version: '0.1.0',
    });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: String(err) });
  }
});

// Record Audit Event
app.post('/api/v1/audit/events', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const {
    organisationId,
    actorUserId,
    actorRole,
    action,
    resourceType,
    resourceId,
    clientIp,
    userAgent,
    beforeState,
    afterState,
    result,
  } = req.body;

  if (!action || !resourceType) {
    res.status(400).json({
      type: 'https://api.aethra.energy/errors/invalid-request',
      title: 'Bad Request',
      status: 400,
      detail: 'action and resourceType are mandatory for recording audit events',
      code: 'ERR_MISSING_AUDIT_FIELDS',
      correlationId,
    });
    return;
  }

  try {
    const auditRecord = await auditService.recordAuditEvent({
      organisationId,
      actorUserId,
      actorRole,
      clientIp: clientIp || (req.ip as string),
      userAgent: userAgent || (req.headers['user-agent'] as string),
      action,
      resourceType,
      resourceId,
      requestCorrelationId: correlationId,
      beforeState,
      afterState,
      result,
    });

    res.status(201).json({
      success: true,
      data: auditRecord,
      meta: { correlationId, recordedAt: auditRecord.recorded_at },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to record audit event');
    res.status(500).json({ error: 'Failed to record audit event', detail: String(err) });
  }
});

// Query Audit Logs
app.get('/api/v1/audit/events', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const {
    organisationId,
    actorUserId,
    action,
    resourceType,
    resourceId,
    result,
    limit,
    offset,
  } = req.query;

  try {
    const results = await auditService.queryAuditEvents({
      organisationId: organisationId as string,
      actorUserId: actorUserId as string,
      action: action as string,
      resourceType: resourceType as string,
      resourceId: resourceId as string,
      requestCorrelationId: (req.query.correlationId as string) || undefined,
      result: result as 'success' | 'failure' | 'denied',
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });

    res.status(200).json({
      success: true,
      data: results.items,
      pagination: {
        limit: results.limit,
        offset: results.offset,
        count: results.items.length,
      },
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to query audit logs');
    res.status(500).json({ error: 'Failed to query audit logs', detail: String(err) });
  }
});

const PORT = config.port || 3019;
app.listen(PORT, () => {
  logger.info(`[Audit Service] Running on port ${PORT}`);
});

export default app;
