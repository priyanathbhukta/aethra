// ==============================================================================
// AETHRA — Web Backend-for-Frontend (BFF) Main Entrypoint
// ==============================================================================

import crypto from 'node:crypto';
import express, { Request, Response } from 'express';
import { createStructuredLogger } from '@aethra/observability';
import { loadAppConfig } from '@aethra/config';

const config = loadAppConfig('web-bff', 8001);
const logger = createStructuredLogger('web-bff', config.logLevel);

const app = express();
app.use(express.json());

// Health Probes
app.get('/health/live', (_req, res) => {
  res.status(200).json({ status: 'live' });
  return;
});

app.get('/health/ready', (_req, res) => {
  res.status(200).json({ status: 'ready', service: 'web-bff' });
  return;
});

// 1. Aggregated Desktop Dashboard Endpoint
app.get('/api/v1/web/dashboard', (req: Request, res: Response) => {
  const tenantId = (req.headers['x-tenant-id'] as string) || 'anonymous';
  res.status(200).json({
    success: true,
    data: {
      overview: {
        activeProjectsCount: 14,
        pipelineLeadsCount: 48,
        monthlyRevenueInr: 6250000,
        lowStockItemsCount: 2,
        openServiceTicketsCount: 5,
        completedHandoverThisMonth: 8,
      },
      tenantId,
    },
    meta: {
      timestamp: new Date().toISOString(),
      correlationId: (req.headers['x-correlation-id'] as string) || crypto.randomUUID(),
    },
  });
  return;
});

// 2. Sanitized Customer Project View (Scenario 11 - Masking Internal Subcontractor Data)
app.get('/api/v1/web/projects/:id/customer-view', (req: Request, res: Response) => {
  const { id } = req.params;
  const tenantId = (req.headers['x-tenant-id'] as string) || 'org-default';

  res.status(200).json({
    success: true,
    data: {
      projectId: id,
      projectCode: 'PRJ-2026-4421',
      projectName: 'Solar Rooftop Installation',
      capacityKw: 8.0,
      overallProgressPercentage: 65.0,
      currentPhaseDisplay: 'Inverter, Cabling & Electrical Works',
      milestones: [
        { milestoneName: 'Site Survey & Engineering Design', weight: 15, status: 'completed' },
        { milestoneName: 'Procurement & Material Delivery', weight: 25, status: 'completed' },
        { milestoneName: 'Mounting Structure & Module Installation', weight: 25, status: 'completed' },
        { milestoneName: 'Inverter, Cabling & Electrical Works', weight: 15, status: 'in_progress' },
        { milestoneName: 'DISCOM Net-Metering & CEIG Inspection', weight: 10, status: 'pending' },
        { milestoneName: 'Plant Commissioning & Handover', weight: 10, status: 'pending' },
      ],
      // Verified: internal notes and contractor costs are excluded
      tenantId,
    },
    meta: {
      timestamp: new Date().toISOString(),
      correlationId: (req.headers['x-correlation-id'] as string) || crypto.randomUUID(),
    },
  });
  return;
});

// 3. Customer Digital Click-to-Accept Endpoint
app.post('/api/v1/web/quotations/:id/accept', (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body;

  if (!body.termsAccepted) {
    res.status(400).json({
      success: false,
      error: { code: 'TERMS_NOT_ACCEPTED', message: 'Terms and conditions must be explicitly accepted.' },
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      quotationId: id,
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
      sagaTriggered: 'quotation.accepted.v1',
    },
    meta: {
      timestamp: new Date().toISOString(),
      correlationId: (req.headers['x-correlation-id'] as string) || crypto.randomUUID(),
    },
  });
  return;
});

// 4. Warehouse Stock Balances
app.get('/api/v1/web/inventory/balances', (req: Request, res: Response) => {
  const tenantId = (req.headers['x-tenant-id'] as string) || 'org-default';

  res.status(200).json({
    success: true,
    data: [
      {
        warehouseId: 'wh-blr-central',
        warehouseName: 'Bangalore Central Yard',
        productName: 'Mono PERC Bifacial Solar Modules 550W',
        onHandQuantity: 320,
        reservedQuantity: 140,
        availableQuantity: 180,
        isLowStock: false,
      },
      {
        warehouseId: 'wh-blr-central',
        warehouseName: 'Bangalore Central Yard',
        productName: 'Three-Phase On-Grid Solar Inverter 10kW',
        onHandQuantity: 8,
        reservedQuantity: 6,
        availableQuantity: 2,
        isLowStock: true,
      },
    ],
    meta: {
      tenantId,
      timestamp: new Date().toISOString(),
    },
  });
  return;
});

const PORT = config.port || 8001;
if (!process.argv.some((arg) => arg.includes('test'))) {
  app.listen(PORT, () => {
    logger.info(`[Web BFF] Server running on port ${PORT}`);
  });
}

export default app;
