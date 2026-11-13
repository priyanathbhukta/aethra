// ==============================================================================
// AETHRA — Access Control Service Main Entrypoint
// ==============================================================================

import express, { Request, Response, NextFunction } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';
import { createDatabaseClient } from './database/connection.js';
import { AccessControlApplicationService } from './application/access-control.service.js';

const config = loadAppConfig('access-control-service', 3003);
const logger = createStructuredLogger('access-control-service', config.logLevel);

initTracing({ serviceName: 'access-control-service' });

export const db = createDatabaseClient();
export const accessControlService = new AccessControlApplicationService(db);

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
      service: 'access-control-service',
      database: 'access_control_db',
      version: '0.1.0',
    });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: String(err) });
  }
});

// Evaluate Access Policy (RBAC + ABAC)
app.post('/api/v1/access/evaluate', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { userId, organisationId, membershipId, requiredPermission, resourceAttributes } = req.body;

  if (!userId || !organisationId || !requiredPermission) {
    res.status(400).json({
      type: 'https://api.aethra.energy/errors/invalid-request',
      title: 'Bad Request',
      status: 400,
      detail: 'userId, organisationId, and requiredPermission are required for policy evaluation',
      code: 'ERR_MISSING_POLICY_PARAMS',
      correlationId,
    });
    return;
  }

  try {
    const evaluation = await accessControlService.evaluatePolicy({
      userId,
      organisationId,
      membershipId,
      requiredPermission,
      resourceAttributes,
    });

    res.status(200).json({
      success: true,
      data: evaluation,
      meta: { timestamp: new Date().toISOString(), correlationId },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Policy evaluation error');
    res.status(500).json({ error: 'Failed to evaluate policy' });
  }
});

// Assign Role to Organisation Member
app.put('/api/v1/access/members/:membershipId/roles', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = req.headers['x-tenant-id'] as string;
  const assignedByUserId = (req.headers['x-user-id'] as string) || crypto.randomUUID();
  const { membershipId } = req.params;
  const { roleId } = req.body;

  if (!organisationId || !roleId) {
    res.status(400).json({ error: 'Missing organisation context or roleId' });
    return;
  }

  try {
    const assignment = await accessControlService.assignRole({
      organisationId,
      membershipId,
      roleId,
      assignedByUserId,
      correlationId,
    });

    res.status(200).json({
      success: true,
      data: assignment,
      meta: { timestamp: new Date().toISOString(), correlationId },
    });
  } catch (err) {
    logger.error({ err, membershipId }, 'Failed to assign role');
    res.status(500).json({ error: 'Failed to assign role' });
  }
});

// Grant Temporary Privileged Access
app.post('/api/v1/access/temporary-grants', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = req.headers['x-tenant-id'] as string;
  const grantedByUserId = (req.headers['x-user-id'] as string) || crypto.randomUUID();
  const { userId, permissionCode, reason, durationMinutes } = req.body;

  if (!organisationId || !userId || !permissionCode || !reason) {
    res.status(400).json({ error: 'Missing mandatory temporary grant fields' });
    return;
  }

  try {
    const grant = await accessControlService.grantTemporaryAccess({
      organisationId,
      userId,
      permissionCode,
      reason,
      durationMinutes: durationMinutes || 60,
      grantedByUserId,
      correlationId,
    });

    res.status(201).json({
      success: true,
      data: grant,
      meta: { timestamp: new Date().toISOString(), correlationId },
    });
  } catch (err) {
    logger.error({ err, userId }, 'Failed to grant temporary privilege');
    res.status(500).json({ error: 'Failed to grant temporary access' });
  }
});

const PORT = config.port || 3003;
app.listen(PORT, () => {
  logger.info(`[Access Control Service] Running on port ${PORT}`);
});

export default app;
