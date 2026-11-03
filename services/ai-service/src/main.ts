// ==============================================================================
// AETHRA — AI Service Boundary Main Entrypoint (Future Integration)
// ==============================================================================

import express, { Request, Response } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';

const config = loadAppConfig('ai-service', 3020);
const logger = createStructuredLogger('ai-service', config.logLevel);

initTracing({ serviceName: 'ai-service' });

const app = express();
app.use(express.json());

app.get('/health/live', (_req, res) => res.status(200).json({ status: 'live' }));
app.get('/health/ready', (_req, res) => {
  res.status(200).json({ status: 'ready', service: 'ai-service', mode: 'boundary-stub', version: '0.1.0' });
});

app.post('/api/v1/ai/assist', (_req: Request, res: Response) => {
  logger.info('AI Boundary execution requested (disabled for MVP)');
  res.status(501).json({
    error: 'AI operations are architectural boundary stubs in Phase 1',
    status: 'not_implemented',
  });
});

const PORT = config.port || 3020;
app.listen(PORT, () => {
  logger.info(`[AI Service Boundary] Running on port ${PORT}`);
});

export default app;
