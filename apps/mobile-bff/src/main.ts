// ==============================================================================
// AETHRA — Mobile Backend-for-Frontend (BFF) Main Entrypoint
// ==============================================================================

import express, { Request, Response } from 'express';
import { createStructuredLogger } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';

const config = loadAppConfig('mobile-bff', 8002);
const logger = createStructuredLogger('mobile-bff', config.logLevel);

const app = express();
app.use(express.json());

// Health Probes
app.get('/health/live', (_req, res) => res.status(200).json({ status: 'live' }));
app.get('/health/ready', (_req, res) => res.status(200).json({ status: 'ready', service: 'mobile-bff' }));

// Lightweight Mobile Home Feed
app.get('/api/v1/mobile/home-feed', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      cards: [
        { id: '1', type: 'assigned_survey', title: 'Site Survey: Greenwood Villa', due: 'Today, 4:00 PM' },
        { id: '2', type: 'quote_alert', title: 'Proposal QT-2026-0042 Accepted by Client', due: 'Action required' },
      ],
      unreadNotificationsCount: 3,
    },
    meta: {
      timestamp: new Date().toISOString(),
      correlationId: (req.headers['x-correlation-id'] as string) || crypto.randomUUID(),
    },
  });
});

// Mobile Offline Sync Batch Intake
app.post('/api/v1/mobile/sync/batch', (req: Request, res: Response) => {
  const mutations = req.body.mutations || [];
  logger.info({ mutationCount: mutations.length }, 'Processing mobile offline mutations');
  res.status(200).json({
    success: true,
    data: {
      processedCount: mutations.length,
      conflicts: [],
      syncedAt: new Date().toISOString(),
    },
    meta: {
      timestamp: new Date().toISOString(),
      correlationId: (req.headers['x-correlation-id'] as string) || crypto.randomUUID(),
    },
  });
});

const PORT = config.port || 8002;
if (!process.argv.some((arg) => arg.includes('test'))) {
  app.listen(PORT, () => {
    logger.info(`[Mobile BFF] Server running on port ${PORT}`);
  });
}

export default app;
