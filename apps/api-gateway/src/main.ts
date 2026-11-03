// ==============================================================================
// AETHRA — API Gateway Main Entrypoint
// ==============================================================================

import express, { Request, Response, NextFunction } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';

const config = loadAppConfig('api-gateway', 8000);
const logger = createStructuredLogger('api-gateway', config.logLevel);

initTracing({ serviceName: 'api-gateway' });

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 1. Correlation ID Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
  req.headers['x-correlation-id'] = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  next();
});

// 2. Request Logging Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    logger.info({
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
      correlationId: req.headers['x-correlation-id'],
      tenantId: req.headers['x-tenant-id'],
    }, 'HTTP Request Completed');
  });
  next();
});

// 3. Health & Readiness Probes
app.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'live', timestamp: new Date().toISOString() });
});

app.get('/health/ready', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ready',
    timestamp: new Date().toISOString(),
    service: 'api-gateway',
    version: '0.1.0',
  });
});

// 4. API v1 Information & Service Directory
app.get('/api/v1', (_req: Request, res: Response) => {
  res.status(200).json({
    name: 'AETHRA Multi-Tenant Renewable Energy Platform API Gateway',
    version: 'v1',
    status: 'operational',
    routes: {
      webBff: '/api/v1/web',
      mobileBff: '/api/v1/mobile',
      health: '/health/ready',
    },
  });
});

// 5. Global Error Handling (RFC 7807)
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || 'unknown';
  logger.error({ err, correlationId }, 'Unhandled Gateway Exception');
  res.status(500).json({
    type: 'https://api.aethra.energy/errors/gateway-error',
    title: 'Internal Gateway Error',
    status: 500,
    detail: 'An unexpected error occurred in the AETHRA API Gateway',
    instance: req.originalUrl,
    code: 'ERR_GATEWAY_INTERNAL',
    correlationId,
  });
});

const PORT = config.port || 8000;
app.listen(PORT, () => {
  logger.info(`[AETHRA Gateway] Edge Reverse Proxy running on port ${PORT}`);
});

export default app;
