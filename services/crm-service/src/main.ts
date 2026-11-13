// ==============================================================================
// AETHRA — CRM Service Main Entrypoint
// ==============================================================================

import express, { Request, Response, NextFunction } from 'express';
import { createStructuredLogger, initTracing } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';
import { createDatabaseClient } from './database/connection.js';
import { CrmApplicationService } from './application/crm.service.js';

const config = loadAppConfig('crm-service', 3007);
const logger = createStructuredLogger('crm-service', config.logLevel);

initTracing({ serviceName: 'crm-service' });

export const db = createDatabaseClient();
export const crmService = new CrmApplicationService(db);

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
      service: 'crm-service',
      database: 'crm_db',
      version: '0.1.0',
    });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: String(err) });
  }
});

// Create Lead
app.post('/api/v1/crm/leads', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;
  const userId = req.headers['x-user-id'] as string;
  const {
    prospectName,
    prospectPhone,
    prospectEmail,
    prospectType,
    leadSourceId,
    proposedCapacityKw,
    siteCity,
    siteState,
  } = req.body;

  if (!organisationId || !prospectName || !prospectPhone) {
    res.status(400).json({
      type: 'https://api.aethra.energy/errors/invalid-request',
      title: 'Bad Request',
      status: 400,
      detail: 'organisationId, prospectName, and prospectPhone are required',
      code: 'ERR_MISSING_CRM_FIELDS',
      correlationId,
    });
    return;
  }

  try {
    const lead = await crmService.createLead({
      organisationId,
      prospectName,
      prospectPhone,
      prospectEmail,
      prospectType,
      leadSourceId,
      proposedCapacityKw,
      siteCity,
      siteState,
      createdByUserId: userId,
      correlationId,
    });

    res.status(201).json({
      success: true,
      data: lead,
      meta: { correlationId, createdAt: lead.created_at },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to create lead');
    res.status(500).json({ error: 'Failed to create lead', detail: String(err) });
  }
});

// List Leads
app.get('/api/v1/crm/leads', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || (req.query.organisationId as string);
  const { stageId, status, agentId } = req.query;

  if (!organisationId) {
    res.status(400).json({ error: 'Missing organisation context (X-Tenant-ID header or organisationId param)' });
    return;
  }

  try {
    const leads = await crmService.getLeads(organisationId, {
      stageId: stageId as string,
      status: status as string,
      agentId: agentId as string,
    });

    res.status(200).json({
      success: true,
      data: leads,
      meta: { correlationId, count: leads.length },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to list leads');
    res.status(500).json({ error: 'Internal server error listing leads' });
  }
});

// Get Lead by ID
app.get('/api/v1/crm/leads/:id', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || (req.query.organisationId as string);
  const { id } = req.params;

  if (!organisationId) {
    res.status(400).json({ error: 'Missing organisation context' });
    return;
  }

  try {
    const lead = await crmService.getLeadById(organisationId, id);
    if (!lead) {
      res.status(404).json({ error: 'Lead not found in this organisation' });
      return;
    }

    res.status(200).json({
      success: true,
      data: lead,
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to fetch lead');
    res.status(500).json({ error: 'Internal server error fetching lead' });
  }
});

// Assign Lead
app.post('/api/v1/crm/leads/:id/assign', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;
  const assignedByUserId = (req.headers['x-user-id'] as string) || 'system';
  const { id } = req.params;
  const { assignedToUserId, assignmentNotes } = req.body;

  if (!organisationId || !assignedToUserId) {
    res.status(400).json({ error: 'organisationId and assignedToUserId are required' });
    return;
  }

  try {
    const updated = await crmService.assignLead({
      organisationId,
      leadId: id,
      assignedToUserId,
      assignedByUserId,
      assignmentNotes,
    });

    res.status(200).json({
      success: true,
      data: updated,
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to assign lead');
    res.status(500).json({ error: 'Failed to assign lead', detail: String(err) });
  }
});

// Update Lead Stage
app.put('/api/v1/crm/leads/:id/stage', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;
  const performedByUserId = (req.headers['x-user-id'] as string) || 'system';
  const { id } = req.params;
  const { stageId, notes } = req.body;

  if (!organisationId || !stageId) {
    res.status(400).json({ error: 'organisationId and stageId are required' });
    return;
  }

  try {
    const updated = await crmService.updateLeadStage({
      organisationId,
      leadId: id,
      stageId,
      performedByUserId,
      notes,
    });

    res.status(200).json({
      success: true,
      data: updated,
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to update lead stage');
    res.status(500).json({ error: 'Failed to update stage', detail: String(err) });
  }
});

// Convert Lead
app.post('/api/v1/crm/leads/:id/convert', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const organisationId = (req.headers['x-tenant-id'] as string) || req.body.organisationId;
  const convertedByUserId = (req.headers['x-user-id'] as string) || 'system';
  const { id } = req.params;
  const { customerId, quotationId, conversionType } = req.body;

  if (!organisationId) {
    res.status(400).json({ error: 'organisationId is required' });
    return;
  }

  try {
    const conversion = await crmService.convertLead({
      organisationId,
      leadId: id,
      customerId,
      quotationId,
      convertedByUserId,
      conversionType,
      correlationId,
    });

    res.status(200).json({
      success: true,
      data: conversion,
      meta: { correlationId, convertedAt: conversion.converted_at },
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to convert lead');
    res.status(500).json({ error: 'Failed to convert lead', detail: String(err) });
  }
});

const PORT = config.port || 3007;
app.listen(PORT, () => {
  logger.info(`[CRM Service] Running on port ${PORT}`);
});

export default app;
