// ==============================================================================
// AETHRA — Engineering & Estimation Service Main Entrypoint
// ==============================================================================

import express, { Request, Response } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';

const config = loadAppConfig('engineering-service', 3010);
const logger = createStructuredLogger('engineering-service', config.logLevel);

initTracing({ serviceName: 'engineering-service' });

const app = express();
app.use(express.json());

app.get('/health/live', (_req, res) => res.status(200).json({ status: 'live' }));
app.get('/health/ready', (_req, res) => {
  res.status(200).json({ status: 'ready', service: 'engineering-service', database: 'engineering_db', version: '0.1.0' });
});

app.post('/api/v1/engineering/simulate', (req: Request, res: Response) => {
  const { sanctionLoadKw, monthlyUnitsKwh, roofUsableAreaSqm } = req.body;
  logger.info({ sanctionLoadKw, monthlyUnitsKwh }, 'Executing reproducible solar sizing simulation');

  const recommendedCapacityKw = Math.min(Number(sanctionLoadKw) || 5, (Number(roofUsableAreaSqm) || 50) / 10);
  const annualGenerationKwh = recommendedCapacityKw * 1500;

  res.status(200).json({
    success: true,
    data: {
      profileVersion: 'v1.0-mnre-benchmark',
      recommendedCapacityKw,
      annualGenerationKwh,
      assumptions: [
        { key: 'specific_yield', value: 1500, unit: 'kWh/kWp/year' },
        { key: 'derate_factor', value: 0.78, unit: 'ratio' },
      ],
      calculatedAt: new Date().toISOString(),
    },
  });
});

const PORT = config.port || 3010;
app.listen(PORT, () => {
  logger.info(`[Engineering Service] Running on port ${PORT}`);
});

export default app;
