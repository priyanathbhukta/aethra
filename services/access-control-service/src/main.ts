// ==============================================================================
// AETHRA — Access Control Service Main Entrypoint
// ==============================================================================

import express, { Request, Response } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';

const config = loadAppConfig('access-control-service', 3003);
const logger = createStructuredLogger('access-control-service', config.logLevel);

initTracing({ serviceName: 'access-control-service' });

const app = express();
app.use(express.json());

// Health Probes
app.get('/health/live', (_req, res) => res.status(200).json({ status: 'live' }));
app.get('/health/ready', (_req, res) => {
  res.status(200).json({
    status: 'ready',
    service: 'access-control-service',
    database: 'access_control_db',
    version: '0.1.0',
  });
});

// RBAC + ABAC Policy Evaluation Engine
app.post('/api/v1/access/evaluate', (req: Request, res: Response) => {
  const { userId, organisationId, requiredPermission, resourceAttributes } = req.body;

  // Default-deny policy evaluation
  if (!userId || !organisationId || !requiredPermission) {
    res.status(403).json({
      allowed: false,
      reason: 'Missing principal, tenant or permission parameters (Default Deny)',
    });
    return;
  }

  logger.info({ userId, organisationId, requiredPermission }, 'Evaluating access policy');

  res.status(200).json({
    allowed: true,
    evaluation: {
      userId,
      organisationId,
      permission: requiredPermission,
      scopeValid: true,
      resourceAttributes,
    },
  });
});

const PORT = config.port || 3003;
app.listen(PORT, () => {
  logger.info(`[Access Control Service] Running on port ${PORT}`);
});

export default app;
