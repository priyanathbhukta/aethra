// ==============================================================================
// AETHRA — Vendor Relationship Service Main Entrypoint
// ==============================================================================

import express, { Request, Response, NextFunction } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';
import { createDatabaseClient } from './database/connection.js';
import { VendorRelationshipApplicationService } from './application/vendor-relationship.service.js';

const config = loadAppConfig('vendor-relationship-service', 3006);
const logger = createStructuredLogger('vendor-relationship-service', config.logLevel);

initTracing({ serviceName: 'vendor-relationship-service' });

export const db = createDatabaseClient();
export const relationshipService = new VendorRelationshipApplicationService(db);

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
      service: 'vendor-relationship-service',
      database: 'vendor_relationship_db',
      version: '0.1.0',
    });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: String(err) });
  }
});

// Initiate Relationship (Vendor to Customer)
app.post('/api/v1/relationships/initiate', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { organisationId, customerId, purposeCode, metadata } = req.body;

  if (!organisationId || !customerId || !purposeCode) {
    res.status(400).json({
      type: 'https://api.aethra.energy/errors/invalid-request',
      title: 'Bad Request',
      status: 400,
      detail: 'organisationId, customerId, and purposeCode are required',
      code: 'ERR_MISSING_RELATIONSHIP_FIELDS',
      correlationId,
    });
    return;
  }

  try {
    const relationship = await relationshipService.initiateRelationship({
      organisationId,
      customerId,
      purposeCode,
      metadata,
      correlationId,
    });

    res.status(201).json({
      success: true,
      data: relationship,
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to initiate relationship');
    res.status(500).json({ error: 'Failed to initiate relationship', detail: String(err) });
  }
});

// Accept Consent and Activate Relationship (Customer action)
app.post('/api/v1/relationships/:id/consent', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { id } = req.params;
  const { userId, consentVersion, consentMethod } = req.body;

  if (!userId || !consentVersion) {
    res.status(400).json({ error: 'userId and consentVersion are required' });
    return;
  }

  try {
    const result = await relationshipService.acceptConsentAndActivate({
      relationshipId: id,
      userId,
      consentVersion,
      consentMethod,
      ipAddress: (req.ip as string) || '127.0.0.1',
      userAgent: (req.headers['user-agent'] as string) || 'AethraCustomerApp/1.0',
      correlationId,
    });

    res.status(200).json({
      success: true,
      data: result,
      meta: { correlationId, activatedAt: result.activated_at },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to accept consent and activate relationship');
    res.status(500).json({ error: 'Failed to activate relationship', detail: String(err) });
  }
});

// Grant Property Access
app.post('/api/v1/relationships/:id/properties', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { id } = req.params;
  const { propertyId, accessScope } = req.body;

  if (!propertyId) {
    res.status(400).json({ error: 'propertyId is required' });
    return;
  }

  try {
    const propertyGrant = await relationshipService.grantPropertyAccess({
      relationshipId: id,
      propertyId,
      accessScope,
    });

    res.status(201).json({
      success: true,
      data: propertyGrant,
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to grant property access');
    res.status(500).json({ error: 'Failed to grant property access', detail: String(err) });
  }
});

// Revoke Relationship Access
app.post('/api/v1/relationships/:id/revoke', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { id } = req.params;
  const { reason, revokedByUserId, revokedByRole, propertyId, installationId } = req.body;

  if (!revokedByUserId || !reason) {
    res.status(400).json({ error: 'revokedByUserId and reason are required' });
    return;
  }

  try {
    await relationshipService.revokeRelationship({
      relationshipId: id,
      revocationReason: reason,
      revokedByUserId,
      revokedByRole,
      propertyId,
      installationId,
      correlationId,
    });

    res.status(200).json({
      success: true,
      message: `Relationship ${id} revoked successfully`,
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to revoke relationship');
    res.status(500).json({ error: 'Failed to revoke relationship', detail: String(err) });
  }
});

// Validate Vendor Access to Customer / Property
app.get('/api/v1/relationships/validate', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { organisationId, customerId, propertyId } = req.query;

  if (!organisationId || !customerId) {
    res.status(400).json({ error: 'organisationId and customerId query parameters are required' });
    return;
  }

  try {
    const authResult = await relationshipService.validateVendorAccess({
      organisationId: organisationId as string,
      customerId: customerId as string,
      propertyId: (propertyId as string) || undefined,
    });

    res.status(200).json({
      success: true,
      data: authResult,
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to validate vendor access');
    res.status(500).json({ error: 'Internal server error validating access' });
  }
});

// Get Relationships for Vendor
app.get('/api/v1/relationships/vendor/:organisationId', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { organisationId } = req.params;

  try {
    const relationships = await relationshipService.getVendorRelationships(organisationId);
    res.status(200).json({
      success: true,
      data: relationships,
      meta: { correlationId, count: relationships.length },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to fetch vendor relationships');
    res.status(500).json({ error: 'Internal server error fetching relationships' });
  }
});

// Get Relationships for Customer
app.get('/api/v1/relationships/customer/:customerId', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { customerId } = req.params;

  try {
    const relationships = await relationshipService.getCustomerRelationships(customerId);
    res.status(200).json({
      success: true,
      data: relationships,
      meta: { correlationId, count: relationships.length },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to fetch customer relationships');
    res.status(500).json({ error: 'Internal server error fetching relationships' });
  }
});

const PORT = config.port || 3006;
app.listen(PORT, () => {
  logger.info(`[Vendor Relationship Service] Running on port ${PORT}`);
});

export default app;
