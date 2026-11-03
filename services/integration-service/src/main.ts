// ==============================================================================
// AETHRA — Integration Service Main Entrypoint
// ==============================================================================

import express, { Request, Response } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';

const config = loadAppConfig('integration-service', 3018);
const logger = createStructuredLogger('integration-service', config.logLevel);

initTracing({ serviceName: 'integration-service' });

const app = express();
app.use(express.json());

app.get('/health/live', (_req, res) => res.status(200).json({ status: 'live' }));
app.get('/health/ready', (_req, res) => {
  res.status(200).json({ status: 'ready', service: 'integration-service', database: 'integration_db', version: '0.1.0' });
});

app.post('/api/v1/integrations/webhooks/intake', (_req: Request, res: Response) => {
  const deliveryId = crypto.randomUUID();
  logger.info({ deliveryId }, 'Intake third-party webhook');

  res.status(200).json({
    received: true,
    deliveryId,
    timestamp: new Date().toISOString(),
  });
});

const PORT = config.port || 3018;
app.listen(PORT, () => {
  logger.info(`[Integration Service] Running on port ${PORT}`);
});

export default app;
