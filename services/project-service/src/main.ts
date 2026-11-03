// ==============================================================================
// AETHRA — Project Management Service Main Entrypoint
// ==============================================================================

import express, { Request, Response } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';

const config = loadAppConfig('project-service', 3013);
const logger = createStructuredLogger('project-service', config.logLevel);

initTracing({ serviceName: 'project-service' });

const app = express();
app.use(express.json());

app.get('/health/live', (_req, res) => res.status(200).json({ status: 'live' }));
app.get('/health/ready', (_req, res) => {
  res.status(200).json({ status: 'ready', service: 'project-service', database: 'project_db', version: '0.1.0' });
});

app.post('/api/v1/projects', (req: Request, res: Response) => {
  const { projectName, customerId, propertyId, acceptedQuotationRevisionId, capacityKw } = req.body;
  const projectId = crypto.randomUUID();
  logger.info({ projectId, acceptedQuotationRevisionId }, 'Created EPC solar project from accepted quote');
  res.status(201).json({
    success: true,
    data: {
      id: projectId,
      projectCode: 'PRJ-2026-0001',
      projectName,
      customerId,
      propertyId,
      acceptedQuotationRevisionId,
      capacityKw: capacityKw || 10,
      status: 'initiated',
      createdAt: new Date().toISOString(),
    },
  });
});

const PORT = config.port || 3013;
app.listen(PORT, () => {
  logger.info(`[Project Service] Running on port ${PORT}`);
});

export default app;
