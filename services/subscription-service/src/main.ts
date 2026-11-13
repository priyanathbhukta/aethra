// ==============================================================================
// AETHRA — Subscription & Entitlement Service Main Entrypoint
// ==============================================================================

import express, { Request, Response, NextFunction } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';
import { createDatabaseClient } from './database/connection.js';
import { SubscriptionApplicationService } from './application/subscription.service.js';

const config = loadAppConfig('subscription-service', 3004);
const logger = createStructuredLogger('subscription-service', config.logLevel);

initTracing({ serviceName: 'subscription-service' });

export const db = createDatabaseClient();
export const subscriptionService = new SubscriptionApplicationService(db);

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
app.get('/health/live', (_req, res) => res.status(200).json({ status: 'live' }));
app.get('/health/ready', async (_req, res) => {
  try {
    res.status(200).json({
      status: 'ready',
      service: 'subscription-service',
      database: 'subscription_db',
      version: '0.1.0',
    });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: String(err) });
  }
});

// Get Current Subscription Details for Tenant
app.get('/api/v1/subscriptions/current', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || (req.query.organisationId as string);

  if (!organisationId) {
    res.status(400).json({
      error: 'Missing tenant organisation context (X-Tenant-ID header or organisationId query param)',
    });
    return;
  }

  try {
    const details = await subscriptionService.getSubscriptionDetails(organisationId);
    if (!details) {
      res.status(404).json({ error: 'Subscription not found for this organisation' });
      return;
    }

    res.status(200).json({
      success: true,
      data: details,
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to get subscription details');
    res.status(500).json({ error: 'Internal server error fetching subscription' });
  }
});

// Verify Module Entitlement (Dual-gatekeeper check)
app.get('/api/v1/subscriptions/entitlements/:moduleCode', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || (req.query.organisationId as string);
  const { moduleCode } = req.params;

  if (!organisationId) {
    res.status(400).json({
      error: 'Missing tenant organisation context (X-Tenant-ID header or organisationId query param)',
    });
    return;
  }

  try {
    const result = await subscriptionService.verifyEntitlement(organisationId, moduleCode);
    res.status(200).json({
      success: true,
      data: result,
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to verify entitlement');
    res.status(500).json({ error: 'Internal server error checking entitlement' });
  }
});

// Activate or Upgrade Subscription Plan
app.post('/api/v1/subscriptions/activate', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { organisationId, planId, billingContactEmail, paymentMetadata } = req.body;

  if (!organisationId || !planId) {
    res.status(400).json({ error: 'organisationId and planId are required' });
    return;
  }

  try {
    const result = await subscriptionService.activateSubscription({
      organisationId,
      planId,
      billingContactEmail,
      paymentMetadata,
      correlationId,
    });

    res.status(200).json({
      success: true,
      data: result,
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to activate subscription');
    res.status(500).json({ error: 'Failed to activate subscription', detail: String(err) });
  }
});

// Record Feature Usage (Atomic quota check and increment)
app.post('/api/v1/subscriptions/usage', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { organisationId, featureCode, quantity, idempotencyKey, recordedBy } = req.body;

  if (!organisationId || !featureCode || !quantity || !idempotencyKey) {
    res.status(400).json({
      error: 'organisationId, featureCode, quantity, and idempotencyKey are required',
    });
    return;
  }

  try {
    const result = await subscriptionService.recordUsage({
      organisationId,
      featureCode,
      quantity: Number(quantity),
      idempotencyKey,
      recordedBy,
      correlationId,
    });

    if (!result.success) {
      res.status(403).json({
        type: 'https://api.aethra.energy/errors/quota-exceeded',
        title: 'Quota Exceeded',
        status: 403,
        detail: result.reason,
        data: result,
        correlationId,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: result,
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to record usage');
    res.status(500).json({ error: 'Failed to record usage', detail: String(err) });
  }
});

// Suspend Subscription
app.post('/api/v1/subscriptions/suspend', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { organisationId, reason } = req.body;

  if (!organisationId || !reason) {
    res.status(400).json({ error: 'organisationId and reason are required' });
    return;
  }

  try {
    await subscriptionService.suspendSubscription({
      organisationId,
      reason,
      correlationId,
    });

    res.status(200).json({
      success: true,
      message: `Subscription for organisation ${organisationId} suspended`,
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to suspend subscription');
    res.status(500).json({ error: 'Failed to suspend subscription', detail: String(err) });
  }
});

const PORT = config.port || 3004;
app.listen(PORT, () => {
  logger.info(`[Subscription Service] Running on port ${PORT}`);
});

export default app;
