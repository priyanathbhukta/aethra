// ==============================================================================
// AETHRA — Service Management Service Main Entrypoint
// ==============================================================================

import crypto from 'node:crypto';
import express, { Request, Response, NextFunction } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';
import { createDatabaseClient } from './database/connection.js';
import { ServiceManagementApplicationService } from './application/service-management.service.js';

const config = loadAppConfig('service-management-service', 3016);
const logger = createStructuredLogger('service-management-service', config.logLevel);

initTracing({ serviceName: 'service-management-service' });

export const db = createDatabaseClient();
export const serviceManagementService = new ServiceManagementApplicationService(db);

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
      service: 'service-management-service',
      database: 'service_db',
      version: '0.1.0',
    });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: String(err) });
  }
});

// Create AMC Contract
app.post('/api/v1/services/amc', async (req: Request, res: Response) => {
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID' });
      return;
    }

    const amc = await serviceManagementService.createAmcContract({
      ...req.body,
      organisationId,
    });

    res.status(201).json({ success: true, data: amc });
    return;
  } catch (err: any) {
    logger.error({ err }, 'Failed to create AMC contract');
    res.status(400).json({ error: err.message });
    return;
  }
});

// Create Service Ticket
app.post('/api/v1/services/tickets', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;
  const userId = (req.headers['x-user-id'] as string) || 'system';

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID' });
      return;
    }

    const ticket = await serviceManagementService.createServiceTicket({
      ...req.body,
      organisationId,
      createdByUserId: userId,
      correlationId,
    });

    res.status(201).json({ success: true, data: ticket });
    return;
  } catch (err: any) {
    logger.error({ err, correlationId }, 'Failed to create service ticket');
    res.status(400).json({ error: err.message });
    return;
  }
});

// Get Ticket by ID
app.get('/api/v1/services/tickets/:id', async (req: Request, res: Response) => {
  const organisationId = (req.headers['x-tenant-id'] as string) || (req.query.organisationId as string);

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID' });
      return;
    }

    const ticket = await serviceManagementService.getTicketById(organisationId, req.params.id);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    res.status(200).json({ success: true, data: ticket });
    return;
  } catch (err: any) {
    res.status(500).json({ error: err.message });
    return;
  }
});

// Assign Technician
app.post('/api/v1/services/tickets/:id/assign', async (req: Request, res: Response) => {
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;
  const userId = (req.headers['x-user-id'] as string) || 'system';

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID' });
      return;
    }

    const assignment = await serviceManagementService.assignTechnician({
      ...req.body,
      organisationId,
      ticketId: req.params.id,
      assignedByUserId: userId,
    });

    res.status(201).json({ success: true, data: assignment });
    return;
  } catch (err: any) {
    logger.error({ err }, 'Failed to assign technician');
    res.status(400).json({ error: err.message });
    return;
  }
});

// Record Service Visit & Resolve Ticket
app.post('/api/v1/services/tickets/:id/visits', async (req: Request, res: Response) => {
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID' });
      return;
    }

    const visit = await serviceManagementService.recordServiceVisit({
      ...req.body,
      organisationId,
      ticketId: req.params.id,
    });

    res.status(201).json({ success: true, data: visit });
    return;
  } catch (err: any) {
    logger.error({ err }, 'Failed to record service visit');
    res.status(400).json({ error: err.message });
    return;
  }
});

const PORT = config.port || 3016;
app.listen(PORT, () => {
  logger.info(`[Service Management Service] Running on port ${PORT}`);
});

export default app;
