// ==============================================================================
// AETHRA — Service Management Service Main Entrypoint
// ==============================================================================

import express, { Request, Response } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';

const config = loadAppConfig('service-management-service', 3016);
const logger = createStructuredLogger('service-management-service', config.logLevel);

initTracing({ serviceName: 'service-management-service' });

const app = express();
app.use(express.json());

app.get('/health/live', (_req, res) => res.status(200).json({ status: 'live' }));
app.get('/health/ready', (_req, res) => {
  res.status(200).json({ status: 'ready', service: 'service-management-service', database: 'service_db', version: '0.1.0' });
});

app.post('/api/v1/services/tickets', (req: Request, res: Response) => {
  const { propertyId, issueDescription, priority } = req.body;
  const ticketId = crypto.randomUUID();
  logger.info({ ticketId, propertyId, priority }, 'Logged customer service ticket');

  res.status(201).json({
    success: true,
    data: {
      ticketId,
      ticketNumber: 'TKT-2026-0001',
      propertyId,
      issueDescription,
      status: 'open',
      priority: priority || 'medium',
      createdAt: new Date().toISOString(),
    },
  });
});

const PORT = config.port || 3016;
app.listen(PORT, () => {
  logger.info(`[Service Management Service] Running on port ${PORT}`);
});

export default app;
