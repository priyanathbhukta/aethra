// ==============================================================================
// AETHRA — Document & File Service Main Entrypoint
// ==============================================================================

import express, { Request, Response } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';

const config = loadAppConfig('document-service', 3014);
const logger = createStructuredLogger('document-service', config.logLevel);

initTracing({ serviceName: 'document-service' });

const app = express();
app.use(express.json());

app.get('/health/live', (_req, res) => res.status(200).json({ status: 'live' }));
app.get('/health/ready', (_req, res) => {
  res.status(200).json({ status: 'ready', service: 'document-service', database: 'document_db', version: '0.1.0' });
});

// Presigned S3 Upload Session Generator
app.post('/api/v1/documents/upload-sessions', (req: Request, res: Response) => {
  const { fileName, contentType, classification } = req.body;
  const fileId = crypto.randomUUID();
  logger.info({ fileId, fileName, contentType, classification }, 'Generated presigned S3 upload session');

  res.status(201).json({
    success: true,
    data: {
      fileId,
      uploadUrl: `https://s3.ap-south-1.amazonaws.com/aethra-files-prod/${fileId}/${fileName}?X-Amz-Signature=mock`,
      expiresInSeconds: 900,
    },
  });
});

const PORT = config.port || 3014;
app.listen(PORT, () => {
  logger.info(`[Document Service] Running on port ${PORT}`);
});

export default app;
