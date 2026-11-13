// ==============================================================================
// AETHRA — Project Management Service Main Entrypoint
// ==============================================================================

import crypto from 'node:crypto';
import express, { Request, Response, NextFunction } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';
import { createDatabaseClient } from './database/connection.js';
import { ProjectApplicationService } from './application/project.service.js';

const config = loadAppConfig('project-service', 3013);
const logger = createStructuredLogger('project-service', config.logLevel);

initTracing({ serviceName: 'project-service' });

export const db = createDatabaseClient();
export const projectService = new ProjectApplicationService(db);

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
      service: 'project-service',
      database: 'project_db',
      version: '0.1.0',
    });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: String(err) });
  }
});

// Create EPC Solar Project
app.post('/api/v1/projects', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;
  const userId = (req.headers['x-user-id'] as string) || 'system';

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID' });
      return;
    }

    const result = await projectService.createProject({
      ...req.body,
      organisationId,
      projectManagerUserId: userId,
      correlationId,
    });

    res.status(201).json({ success: true, data: result });
    return;
  } catch (err: any) {
    logger.error({ err, correlationId }, 'Failed to create project');
    res.status(400).json({ error: err.message });
    return;
  }
});

// Get Project by ID (Vendor Operations view)
app.get('/api/v1/projects/:id', async (req: Request, res: Response) => {
  const organisationId = (req.headers['x-tenant-id'] as string) || (req.query.organisationId as string);

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID' });
      return;
    }

    const project = await projectService.getProjectById(organisationId, req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.status(200).json({ success: true, data: project });
    return;
  } catch (err: any) {
    res.status(500).json({ error: err.message });
    return;
  }
});

// Update Milestone Status
app.put('/api/v1/projects/:id/milestones/:milestoneId', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID' });
      return;
    }

    const result = await projectService.updateMilestone({
      organisationId,
      projectId: req.params.id,
      milestoneId: req.params.milestoneId,
      status: req.body.status,
      completedDate: req.body.completedDate,
      correlationId,
    });

    res.status(200).json({ success: true, data: result });
    return;
  } catch (err: any) {
    logger.error({ err, correlationId }, 'Failed to update milestone');
    res.status(400).json({ error: err.message });
    return;
  }
});

// Complete Handover
app.post('/api/v1/projects/:id/handover', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;
  const userId = (req.headers['x-user-id'] as string) || 'system';

  try {
    if (!organisationId) {
      res.status(400).json({ error: 'Missing tenant organisation ID' });
      return;
    }

    const handover = await projectService.completeHandover({
      ...req.body,
      organisationId,
      projectId: req.params.id,
      signedOffByUserId: userId,
      correlationId,
    });

    res.status(200).json({ success: true, data: handover });
    return;
  } catch (err: any) {
    logger.error({ err, correlationId }, 'Failed to complete handover');
    res.status(400).json({ error: err.message });
    return;
  }
});

// Customer Progress View (Exclusively sanitized for Customer Portal)
app.get('/api/v1/customer/projects/:id/progress', async (req: Request, res: Response) => {
  const customerId = (req.headers['x-customer-id'] as string) || (req.query.customerId as string);

  try {
    if (!customerId) {
      res.status(400).json({ error: 'Missing customer ID' });
      return;
    }

    const progressView = await projectService.getCustomerProgressView(customerId, req.params.id);
    if (!progressView) {
      res.status(404).json({ error: 'Progress view not found for this customer' });
      return;
    }

    res.status(200).json({ success: true, data: progressView });
    return;
  } catch (err: any) {
    res.status(500).json({ error: err.message });
    return;
  }
});

const PORT = config.port || 3013;
app.listen(PORT, () => {
  logger.info(`[Project Service] Running on port ${PORT}`);
});

export default app;
