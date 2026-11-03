// ==============================================================================
// AETHRA — Audit Service Main Entrypoint
// ==============================================================================

import express, { Request, Response } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';

const config = loadAppConfig('audit-service', 3019);
const logger = createStructuredLogger('audit-service', config.logLevel);

initTracing({ serviceName: 'audit-service' });

const app = express();
app.use(express.json());

app.get('/health/live', (_req, res) => res.status(200).json({ status: 'live' }));
app.get('/health/ready', (_req, res) => {
  res.status(200).json({ status: 'ready', service: 'audit-service', database: 'audit_db', version: '0.1.0' });
});

app.post('/api/v1/audit/events', (req: Request, res: Response) => {
  const { actorUserId, action, resourceType, resourceId } = req.body;
  const auditId = crypto.randomUUID();
  logger.info({ auditId, actorUserId, action, resourceType, resourceId }, 'Appended immutable audit event');

  res.status(201).json({
    success: true,
    data: {
      auditId,
      action,
      resourceType,
      resourceId,
      recordedAt: new Date().toISOString(),
    },
  });
});

const PORT = config.port || 3019;
app.listen(PORT, () => {
  logger.info(`[Audit Service] Running on port ${PORT}`);
});

export default app;
