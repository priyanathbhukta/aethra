// ==============================================================================
// AETHRA — CRM Service Main Entrypoint
// ==============================================================================

import express, { Request, Response } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';

const config = loadAppConfig('crm-service', 3007);
const logger = createStructuredLogger('crm-service', config.logLevel);

initTracing({ serviceName: 'crm-service' });

const app = express();
app.use(express.json());

app.get('/health/live', (_req, res) => res.status(200).json({ status: 'live' }));
app.get('/health/ready', (_req, res) => {
  res.status(200).json({ status: 'ready', service: 'crm-service', database: 'crm_db', version: '0.1.0' });
});

app.post('/api/v1/leads', (req: Request, res: Response) => {
  const { prospectName, prospectPhone, proposedCapacityKw } = req.body;
  const leadId = crypto.randomUUID();
  logger.info({ leadId, prospectName }, 'Created pre-sales CRM lead');
  res.status(201).json({
    success: true,
    data: {
      id: leadId,
      leadCode: 'LD-2026-0001',
      prospectName,
      prospectPhone,
      proposedCapacityKw: proposedCapacityKw || 5,
      status: 'open',
      createdAt: new Date().toISOString(),
    },
  });
});

const PORT = config.port || 3007;
app.listen(PORT, () => {
  logger.info(`[CRM Service] Running on port ${PORT}`);
});

export default app;
