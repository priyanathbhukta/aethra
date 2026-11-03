// ==============================================================================
// AETHRA — Product Catalogue Service Main Entrypoint
// ==============================================================================

import express, { Request, Response } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';

const config = loadAppConfig('catalogue-service', 3008);
const logger = createStructuredLogger('catalogue-service', config.logLevel);

initTracing({ serviceName: 'catalogue-service' });

const app = express();
app.use(express.json());

app.get('/health/live', (_req, res) => res.status(200).json({ status: 'live' }));
app.get('/health/ready', (_req, res) => {
  res.status(200).json({ status: 'ready', service: 'catalogue-service', database: 'catalogue_db', version: '0.1.0' });
});

app.get('/api/v1/catalogue/products', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: [
      { id: 'mod-1', brand: 'Waaree', modelCode: 'WSMD-540', powerWp: 540, cellType: 'Mono PERC' },
      { id: 'inv-1', brand: 'Growatt', modelCode: 'MIN-5000TL-X', capacityKw: 5, type: 'String Inverter' },
    ],
  });
});

const PORT = config.port || 3008;
app.listen(PORT, () => {
  logger.info(`[Catalogue Service] Running on port ${PORT}`);
});

export default app;
