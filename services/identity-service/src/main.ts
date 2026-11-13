// ==============================================================================
// AETHRA — Identity Service Main Entrypoint
// ==============================================================================

import express, { Request, Response, NextFunction } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';
import { createDatabaseClient } from './database/connection.js';
import { AwsCognitoOidcAdapter } from './infrastructure/oidc-provider.adapter.js';
import { IdentityApplicationService } from './application/identity.service.js';

const config = loadAppConfig('identity-service', 3001);
const logger = createStructuredLogger('identity-service', config.logLevel);

initTracing({ serviceName: 'identity-service' });

export const db = createDatabaseClient('identity_db');
export const oidcAdapter = new AwsCognitoOidcAdapter();
export const identityService = new IdentityApplicationService(db, oidcAdapter);

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
      service: 'identity-service',
      database: 'identity_db',
      version: '0.1.0',
    });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: String(err) });
  }
});

// User Registration
app.post('/api/v1/auth/register', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { email, fullName, phone } = req.body;

  if (!email || !fullName) {
    res.status(400).json({
      type: 'https://api.aethra.energy/errors/invalid-request',
      title: 'Bad Request',
      status: 400,
      detail: 'email and fullName are required parameters',
      instance: req.originalUrl,
      code: 'ERR_MISSING_REQUIRED_FIELDS',
      correlationId,
    });
    return;
  }

  try {
    const user = await identityService.registerUser({
      email,
      fullName,
      phone,
      correlationId,
    });

    res.status(201).json({
      success: true,
      data: user,
      meta: {
        timestamp: new Date().toISOString(),
        correlationId,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('CONFLICT:')) {
      res.status(409).json({
        type: 'https://api.aethra.energy/errors/conflict',
        title: 'Conflict',
        status: 409,
        detail: message,
        instance: req.originalUrl,
        code: 'ERR_USER_ALREADY_EXISTS',
        correlationId,
      });
      return;
    }
    logger.error({ err, correlationId }, 'User registration failed');
    res.status(500).json({
      type: 'https://api.aethra.energy/errors/internal',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Registration could not be completed',
      instance: req.originalUrl,
      code: 'ERR_REGISTRATION_FAILED',
      correlationId,
    });
  }
});

// Session Revocation (Logout)
app.post('/api/v1/auth/sessions/revoke', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { sessionToken } = req.body;

  if (!sessionToken) {
    res.status(400).json({ error: 'sessionToken required' });
    return;
  }

  const revoked = await identityService.revokeSession(sessionToken);
  res.status(200).json({
    success: true,
    data: { revoked },
    meta: { timestamp: new Date().toISOString(), correlationId },
  });
});

const PORT = config.port || 3001;
app.listen(PORT, () => {
  logger.info(`[Identity Service] Running on port ${PORT}`);
});

export default app;
