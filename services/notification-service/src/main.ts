// ==============================================================================
// AETHRA — Notification Service Main Entrypoint
// ==============================================================================

import express, { Request, Response } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';

const config = loadAppConfig('notification-service', 3015);
const logger = createStructuredLogger('notification-service', config.logLevel);

initTracing({ serviceName: 'notification-service' });

const app = express();
app.use(express.json());

app.get('/health/live', (_req, res) => res.status(200).json({ status: 'live' }));
app.get('/health/ready', (_req, res) => {
  res.status(200).json({ status: 'ready', service: 'notification-service', database: 'notification_db', version: '0.1.0' });
});

app.post('/api/v1/notifications/send', (req: Request, res: Response) => {
  const { channel, destination, templateCode } = req.body;
  const deliveryId = crypto.randomUUID();
  logger.info({ deliveryId, channel, destination, templateCode }, 'Enqueued notification dispatch');

  res.status(202).json({
    success: true,
    data: {
      deliveryId,
      channel,
      status: 'queued',
      queuedAt: new Date().toISOString(),
    },
  });
});

const PORT = config.port || 3015;
app.listen(PORT, () => {
  logger.info(`[Notification Service] Running on port ${PORT}`);
});

export default app;
