// ==============================================================================
// AETHRA — Quotation Service Main Entrypoint
// ==============================================================================

import express, { Request, Response } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';

const config = loadAppConfig('quotation-service', 3009);
const logger = createStructuredLogger('quotation-service', config.logLevel);

initTracing({ serviceName: 'quotation-service' });

const app = express();
app.use(express.json());

// Health Probes
app.get('/health/live', (_req, res) => res.status(200).json({ status: 'live' }));
app.get('/health/ready', (_req, res) => {
  res.status(200).json({
    status: 'ready',
    service: 'quotation-service',
    database: 'quotation_db',
    version: '0.1.0',
  });
});

// Issue Quotation Revision (Freezes revision)
app.post('/api/v1/quotations/:id/revisions/:revNum/issue', (req: Request, res: Response) => {
  const { id, revNum } = req.params;
  logger.info({ quotationId: id, revisionNumber: revNum }, 'Freezing and issuing quotation revision');

  res.status(200).json({
    success: true,
    data: {
      quotationId: id,
      revisionNumber: Number(revNum),
      status: 'issued',
      issuedAt: new Date().toISOString(),
      frozen: true,
    },
  });
});

const PORT = config.port || 3009;
app.listen(PORT, () => {
  logger.info(`[Quotation Service] Running on port ${PORT}`);
});

export default app;
