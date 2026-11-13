// ==============================================================================
// AETHRA — Customer Service Main Entrypoint
// ==============================================================================

import express, { Request, Response, NextFunction } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';
import { createDatabaseClient } from './database/connection.js';
import { CustomerApplicationService } from './application/customer.service.js';

const config = loadAppConfig('customer-service', 3005);
const logger = createStructuredLogger('customer-service', config.logLevel);

initTracing({ serviceName: 'customer-service' });

export const db = createDatabaseClient();
export const customerService = new CustomerApplicationService(db);

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
      service: 'customer-service',
      database: 'customer_db',
      version: '0.1.0',
    });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: String(err) });
  }
});

// Customer Account Registration
app.post('/api/v1/customers', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const {
    accountType,
    legalName,
    displayName,
    primaryEmail,
    primaryPhone,
    alternatePhone,
    panTaxId,
    gstNumber,
    languagePreference,
  } = req.body;

  if (!legalName || !primaryEmail || !primaryPhone) {
    res.status(400).json({
      type: 'https://api.aethra.energy/errors/invalid-request',
      title: 'Bad Request',
      status: 400,
      detail: 'legalName, primaryEmail, and primaryPhone are required',
      code: 'ERR_MISSING_CUSTOMER_FIELDS',
      correlationId,
    });
    return;
  }

  try {
    const result = await customerService.createCustomer({
      accountType,
      legalName,
      displayName,
      primaryEmail,
      primaryPhone,
      alternatePhone,
      panTaxId,
      gstNumber,
      languagePreference,
      correlationId,
    });

    res.status(201).json({
      success: true,
      data: result,
      meta: { correlationId, createdAt: result.account.created_at },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to create customer');
    res.status(500).json({ error: 'Failed to create customer', detail: String(err) });
  }
});

// Get Customer by ID
app.get('/api/v1/customers/:id', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { id } = req.params;

  try {
    const customer = await customerService.getCustomerDetails(id);
    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: customer,
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to fetch customer');
    res.status(500).json({ error: 'Internal server error fetching customer' });
  }
});

// Link Platform User to Customer (Portal Access)
app.post('/api/v1/customers/:id/users', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { id } = req.params;
  const { userId, customerRole } = req.body;

  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  try {
    const link = await customerService.linkCustomerUser({
      customerId: id,
      userId,
      customerRole,
    });

    res.status(200).json({
      success: true,
      data: link,
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to link user to customer');
    res.status(500).json({ error: 'Failed to link user to customer', detail: String(err) });
  }
});

// Add Real Estate Property for Customer
app.post('/api/v1/customers/:id/properties', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { id } = req.params;
  const propertyDto = req.body;

  if (!propertyDto.propertyName || !propertyDto.propertyType || !propertyDto.addressLine1 || !propertyDto.city || !propertyDto.state || !propertyDto.postalCode) {
    res.status(400).json({
      error: 'propertyName, propertyType, addressLine1, city, state, and postalCode are required',
    });
    return;
  }

  try {
    const property = await customerService.addProperty({
      customerId: id,
      property: propertyDto,
    });

    res.status(201).json({
      success: true,
      data: property,
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to add customer property');
    res.status(500).json({ error: 'Failed to add property', detail: String(err) });
  }
});

// List Customer Properties
app.get('/api/v1/customers/:id/properties', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { id } = req.params;

  try {
    const properties = await customerService.getCustomerProperties(id);
    res.status(200).json({
      success: true,
      data: properties,
      meta: { correlationId, count: properties.length },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to list customer properties');
    res.status(500).json({ error: 'Internal server error listing properties' });
  }
});

// Add Installation to Property (Solar Rooftop, BESS, EV)
app.post('/api/v1/customers/:id/properties/:propertyId/installations', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { propertyId } = req.params;
  const installationDto = req.body;

  if (!installationDto.installationName || !installationDto.systemType || !installationDto.capacityKw) {
    res.status(400).json({
      error: 'installationName, systemType, and capacityKw are required',
    });
    return;
  }

  try {
    const installation = await customerService.addInstallation({
      propertyId,
      installation: installationDto,
    });

    res.status(201).json({
      success: true,
      data: installation,
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to add property installation');
    res.status(500).json({ error: 'Failed to add installation', detail: String(err) });
  }
});

// Delegate Property Access
app.post('/api/v1/customers/:id/properties/:propertyId/delegations', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { id, propertyId } = req.params;
  const { userId, accessLevel, validUntil } = req.body;

  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  try {
    const delegation = await customerService.delegatePropertyAccess({
      customerId: id,
      propertyId,
      userId,
      accessLevel,
      validUntil: validUntil ? new Date(validUntil) : undefined,
    });

    res.status(201).json({
      success: true,
      data: delegation,
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to delegate property access');
    res.status(500).json({ error: 'Failed to delegate property access', detail: String(err) });
  }
});

const PORT = config.port || 3005;
app.listen(PORT, () => {
  logger.info(`[Customer Service] Running on port ${PORT}`);
});

export default app;
