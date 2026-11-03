// ==============================================================================
// AETHRA — Reporting & Analytics Service Main Entrypoint
// ==============================================================================

import express, { Request, Response } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';

const config = loadAppConfig('reporting-service', 3017);
const logger = createStructuredLogger('reporting-service', config.logLevel);

initTracing({ serviceName: 'reporting-service' });

const app = express();
app.use(express.json());

app.get('/health/live', (_req, res) => res.status(200).json({ status: 'live' }));
app.get('/health/ready', (_req, res) => {
  res.status(200).json({ status: 'ready', service: 'reporting-service', database: 'reporting_db', version: '0.1.0' });
});

app.get('/api/v1/reporting/projections/:type', (req: Request, res: Response) => {
  const { type } = req.params;
  logger.info({ reportType: type }, 'Fetching analytical read projection');

  res.status(200).json({
    success: true,
    data: {
      type,
      totalKwpInstalled: 1450.5,
      totalProjectsCompleted: 88,
      averageTurnaroundDays: 14.2,
      generatedAt: new Date().toISOString(),
    },
  });
});

const PORT = config.port || 3017;
app.listen(PORT, () => {
  logger.info(`[Reporting Service] Running on port ${PORT}`);
});

export default app;
