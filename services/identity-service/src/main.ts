// ==============================================================================
// AETHRA — Identity Service Main Entrypoint
// ==============================================================================

import express, { Request, Response } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';
import { createDatabaseClient } from './database/connection.js';

const config = loadAppConfig('identity-service', 3001);
const logger = createStructuredLogger('identity-service', config.logLevel);

initTracing({ serviceName: 'identity-service' });

const app = express();
app.use(express.json());

// Database client instance
export const db = createDatabaseClient('identity_db');

// Health & Readiness Probes
app.get('/health/live', (_req, res) => res.status(200).json({ status: 'live' }));
app.get('/health/ready', async (_req, res) => {
  try {
    // Quick probe
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

// User Registration endpoint
app.post('/api/v1/auth/register', (req: Request, res: Response) => {
  const { email, fullName, phone } = req.body;
  if (!email || !fullName) {
    res.status(400).json({ error: 'Email and Full Name are required' });
    return;
  }
  const userId = crypto.randomUUID();
  logger.info({ userId, email }, 'User identity registered');
  res.status(201).json({
    success: true,
    data: {
      userId,
      email,
      fullName,
      phone,
      status: 'active',
      emailStatus: 'unverified',
    },
  });
});

const PORT = config.port || 3001;
app.listen(PORT, () => {
  logger.info(`[Identity Service] Running on port ${PORT}`);
});

export default app;
