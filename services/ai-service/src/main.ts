// ==============================================================================
// AETHRA — AI Service Main Entrypoint
// ==============================================================================

import crypto from 'node:crypto';
import express, { Request, Response, NextFunction } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';
import { AiApplicationService } from './application/ai.service.js';

const config = loadAppConfig('ai-service', 3020);
const logger = createStructuredLogger('ai-service', config.logLevel);

initTracing({ serviceName: 'ai-service' });

export const aiService = new AiApplicationService();

const app = express();
app.use(express.json());

// Correlation ID Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
  req.headers['x-correlation-id'] = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  next();
});

// Health Probes
app.get('/health/live', (_req, res) => {
  res.status(200).json({ status: 'live' });
});

app.get('/health/ready', async (_req, res) => {
  res.status(200).json({
    status: 'ready',
    service: 'ai-service',
    models: ['gemini-2.0-flash', 'vision-ocr-v1'],
    version: '0.1.0',
  });
});

// Extract Electricity Bill OCR text
app.post('/api/v1/ai/extract-bill', async (req: Request, res: Response) => {
  const { rawText } = req.body;

  try {
    if (!rawText) {
      res.status(400).json({ error: 'rawText is required' });
      return;
    }

    const result = await aiService.extractElectricityBill(rawText);
    res.status(200).json({ success: true, data: result });
    return;
  } catch (err: any) {
    logger.error({ err }, 'Bill extraction failed');
    res.status(500).json({ error: err.message });
    return;
  }
});

// Triage Customer Service Ticket
app.post('/api/v1/ai/triage-ticket', async (req: Request, res: Response) => {
  const { issueDescription } = req.body;

  try {
    if (!issueDescription) {
      res.status(400).json({ error: 'issueDescription is required' });
      return;
    }

    const result = await aiService.triageServiceTicket(issueDescription);
    res.status(200).json({ success: true, data: result });
    return;
  } catch (err: any) {
    logger.error({ err }, 'Ticket triage failed');
    res.status(500).json({ error: err.message });
    return;
  }
});

const PORT = config.port || 3020;
app.listen(PORT, () => {
  logger.info(`[AI Service] Running on port ${PORT}`);
});

export default app;
