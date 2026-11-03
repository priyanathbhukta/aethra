// ==============================================================================
// AETHRA — Customer Service Main Entrypoint
// ==============================================================================

import express, { Request, Response } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';

const config = loadAppConfig('customer-service', 3005);
const logger = createStructuredLogger('customer-service', config.logLevel);

initTracing({ serviceName: 'customer-service' });

const app = express();
app.use(express.json());

// Health Probes
app.get('/health/live', (_req, res) => res.status(200).json({ status: 'live' }));
app.get('/health/ready', (_req, res) => {
  res.status(200).json({
    status: 'ready',
    service: 'customer-service',
    database: 'customer_db',
    version: '0.1.0',
  });
});

// Customer Account Registration
app.post('/api/v1/customers', (req: Request, res: Response) => {
  const { legalName, displayName, accountType } = req.body;
  const customerId = crypto.randomUUID();
  logger.info({ customerId, legalName }, 'Created customer account');
  res.status(201).json({
    success: true,
    data: {
      id: customerId,
      legalName,
      displayName: displayName || legalName,
      accountType: accountType || 'individual',
      status: 'active',
      createdAt: new Date().toISOString(),
    },
  });
});

const PORT = config.port || 3005;
app.listen(PORT, () => {
  logger.info(`[Customer Service] Running on port ${PORT}`);
});

export default app;
