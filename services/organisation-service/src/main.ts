// ==============================================================================
// AETHRA — Organisation & Tenant Service Main Entrypoint
// ==============================================================================

import express, { Request, Response, NextFunction } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';
import { createDatabaseClient } from './database/connection.js';
import { OrganisationApplicationService } from './application/organisation.service.js';

const config = loadAppConfig('organisation-service', 3002);
const logger = createStructuredLogger('organisation-service', config.logLevel);

initTracing({ serviceName: 'organisation-service' });

export const db = createDatabaseClient();
export const orgService = new OrganisationApplicationService(db);

const app = express();
app.use(express.json());

// Correlation ID & Tenant Context Middleware
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
      service: 'organisation-service',
      database: 'organisation_db',
      version: '0.1.0',
    });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: String(err) });
  }
});

// Onboard Organisation
app.post('/api/v1/organisations', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { legalName, tradeName, ownerUserId, businessCategories, supportEmail, supportPhone, addressLine1, city, state, postalCode } = req.body;

  if (!legalName || !ownerUserId || !supportEmail || !addressLine1 || !city || !state || !postalCode) {
    res.status(400).json({
      type: 'https://api.aethra.energy/errors/invalid-request',
      title: 'Bad Request',
      status: 400,
      detail: 'Missing mandatory organisation or profile fields',
      instance: req.originalUrl,
      code: 'ERR_MISSING_ORG_FIELDS',
      correlationId,
    });
    return;
  }

  try {
    const org = await orgService.createOrganisation({
      legalName,
      tradeName,
      ownerUserId,
      businessCategories: businessCategories || ['solar_epc'],
      supportEmail,
      supportPhone: supportPhone || '0000000000',
      addressLine1,
      city,
      state,
      postalCode,
      correlationId,
    });

    res.status(201).json({
      success: true,
      data: org,
      meta: { timestamp: new Date().toISOString(), correlationId },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Organisation onboarding failed');
    res.status(500).json({
      type: 'https://api.aethra.energy/errors/internal',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Failed to create organisation',
      code: 'ERR_ORG_CREATION_FAILED',
      correlationId,
    });
  }
});

// Create Branch within current tenant
app.post('/api/v1/organisations/current/branches', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = req.headers['x-tenant-id'] as string;

  if (!organisationId) {
    res.status(401).json({ error: 'Missing tenant context header: X-Tenant-ID' });
    return;
  }

  const { branchCode, name, address, city, state, postalCode, isHeadquarters } = req.body;
  if (!branchCode || !name || !address || !city || !state || !postalCode) {
    res.status(400).json({ error: 'Missing branch fields' });
    return;
  }

  try {
    const branch = await orgService.createBranch({
      organisationId,
      branchCode,
      name,
      address,
      city,
      state,
      postalCode,
      isHeadquarters,
    });

    res.status(201).json({
      success: true,
      data: branch,
      meta: { timestamp: new Date().toISOString(), correlationId },
    });
  } catch (err) {
    logger.error({ err, organisationId }, 'Branch creation failed');
    res.status(500).json({ error: 'Failed to create branch' });
  }
});

// Create Warehouse within current tenant
app.post('/api/v1/organisations/current/warehouses', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = req.headers['x-tenant-id'] as string;

  if (!organisationId) {
    res.status(401).json({ error: 'Missing tenant context header: X-Tenant-ID' });
    return;
  }

  const { warehouseCode, name, address, city, state, postalCode, branchId } = req.body;
  if (!warehouseCode || !name || !address || !city || !state || !postalCode) {
    res.status(400).json({ error: 'Missing warehouse fields' });
    return;
  }

  try {
    const warehouse = await orgService.createWarehouse({
      organisationId,
      branchId,
      warehouseCode,
      name,
      address,
      city,
      state,
      postalCode,
    });

    res.status(201).json({
      success: true,
      data: warehouse,
      meta: { timestamp: new Date().toISOString(), correlationId },
    });
  } catch (err) {
    logger.error({ err, organisationId }, 'Warehouse creation failed');
    res.status(500).json({ error: 'Failed to create warehouse' });
  }
});

// Invite Employee to current tenant
app.post('/api/v1/organisations/current/invitations', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = req.headers['x-tenant-id'] as string;
  const invitedByUserId = (req.headers['x-user-id'] as string) || crypto.randomUUID();

  if (!organisationId) {
    res.status(401).json({ error: 'Missing tenant context header: X-Tenant-ID' });
    return;
  }

  const { email, phone, roleHints } = req.body;
  if (!email || !roleHints) {
    res.status(400).json({ error: 'email and roleHints required' });
    return;
  }

  try {
    const invite = await orgService.inviteEmployee({
      organisationId,
      invitedByUserId,
      email,
      phone,
      roleHints: Array.isArray(roleHints) ? roleHints : [roleHints],
      correlationId,
    });

    res.status(201).json({
      success: true,
      data: invite,
      meta: { timestamp: new Date().toISOString(), correlationId },
    });
  } catch (err) {
    logger.error({ err, organisationId }, 'Invitation failed');
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

// List User Memberships (Multi-Tenancy)
app.get('/api/v1/organisations/user-memberships', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const userId = req.headers['x-user-id'] as string;

  if (!userId) {
    res.status(401).json({ error: 'Missing user context header: X-User-ID' });
    return;
  }

  const memberships = await orgService.getUserMemberships(userId);
  res.status(200).json({
    success: true,
    data: memberships,
    meta: { timestamp: new Date().toISOString(), correlationId },
  });
});

const PORT = config.port || 3002;
app.listen(PORT, () => {
  logger.info(`[Organisation Service] Running on port ${PORT}`);
});

export default app;
