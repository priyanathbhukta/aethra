// ==============================================================================
// AETHRA — Notification Service Main Entrypoint
// ==============================================================================

import crypto from 'node:crypto';
import express, { Request, Response, NextFunction } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';
import { createDatabaseClient } from './database/connection.js';
import { NotificationApplicationService } from './application/notification.service.js';

const config = loadAppConfig('notification-service', 3015);
const logger = createStructuredLogger('notification-service', config.logLevel);

initTracing({ serviceName: 'notification-service' });

export const db = createDatabaseClient();
export const notificationService = new NotificationApplicationService(db);

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
  try {
    res.status(200).json({
      status: 'ready',
      service: 'notification-service',
      database: 'notification_db',
      version: '0.1.0',
    });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: String(err) });
  }
});

// Send Notification (Email, SMS, WhatsApp, Push)
app.post('/api/v1/notifications/send', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;

  try {
    const result = await notificationService.sendNotification({
      ...req.body,
      organisationId,
      correlationId,
    });

    res.status(200).json({ success: true, data: result });
    return;
  } catch (err: any) {
    logger.error({ err, correlationId }, 'Failed to dispatch notification');
    res.status(400).json({ error: err.message });
    return;
  }
});

// Create In-App Notification
app.post('/api/v1/notifications/in-app', async (req: Request, res: Response) => {
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;

  try {
    const notif = await notificationService.createInAppNotification({
      ...req.body,
      organisationId,
    });

    res.status(201).json({ success: true, data: notif });
    return;
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }
});

// Get User In-App Notifications
app.get('/api/v1/notifications/users/:userId/in-app', async (req: Request, res: Response) => {
  try {
    const notifications = await notificationService.listUserNotifications(req.params.userId);
    res.status(200).json({ success: true, data: notifications });
    return;
  } catch (err: any) {
    res.status(500).json({ error: err.message });
    return;
  }
});

const PORT = config.port || 3015;
app.listen(PORT, () => {
  logger.info(`[Notification Service] Running on port ${PORT}`);
});

export default app;
