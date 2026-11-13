// ==============================================================================
// AETHRA Web — EPC Solar Project Tracker & Sanitization Unit Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import { WebProjectService } from '../services/projectService.js';
import { WebProjectView, WebProjectMilestone } from '../types/web.types.js';

test('Web App — Project Milestone Tracker & Customer View Sanitization', async (t) => {
  await t.test('Scenario 1: Computes weighted overall execution progress percentage', () => {
    const milestones: WebProjectMilestone[] = [
      { id: 'm1', milestoneName: 'Site Survey & Design', sequenceOrder: 1, status: 'completed', weightagePercent: 15, isCustomerVisible: true },
      { id: 'm2', milestoneName: 'Material Delivery', sequenceOrder: 2, status: 'completed', weightagePercent: 25, isCustomerVisible: true },
      { id: 'm3', milestoneName: 'Mounting Structure', sequenceOrder: 3, status: 'completed', weightagePercent: 25, isCustomerVisible: true },
      { id: 'm4', milestoneName: 'Inverter & Electrical', sequenceOrder: 4, status: 'in_progress', weightagePercent: 15, isCustomerVisible: true }, // 15 * 0.5 = 7.5
      { id: 'm5', milestoneName: 'Net-Metering & CEIG', sequenceOrder: 5, status: 'pending', weightagePercent: 10, isCustomerVisible: true },
      { id: 'm6', milestoneName: 'Commissioning', sequenceOrder: 6, status: 'pending', weightagePercent: 10, isCustomerVisible: true },
    ];

    const progress = WebProjectService.calculateOverallProgress(milestones);

    // 15 + 25 + 25 + 7.5 = 72.5%
    assert.strictEqual(progress, 72.5);
  });

  await t.test('Scenario 2: Sanitizes customer view by stripping internal margins and private notes', () => {
    const project: WebProjectView = {
      projectId: 'prj-secret-101',
      projectCode: 'PRJ-2026-999',
      projectName: 'Sharma Residence 10kW Rooftop',
      customerId: 'cust-sharma',
      customerName: 'Rajesh Sharma',
      propertyAddress: 'Indiranagar, Bangalore',
      capacityKw: 10.0,
      status: 'in_progress',
      overallProgressPercentage: 50.0,
      currentPhaseDisplay: 'Structure Installation',
      internalNotes: [
        'Subcontractor cost is ₹1,80,000 against customer quote of ₹4,50,000.',
        'Gross contractor margin is 42%.',
        'Technician penalty applied for late cable laying.',
      ],
      subcontractorCostInr: 180000,
      milestones: [
        { id: 'm1', milestoneName: 'Site Survey', sequenceOrder: 1, status: 'completed', weightagePercent: 50, isCustomerVisible: true },
        { id: 'm2-internal', milestoneName: 'Subcontractor Audit & Margin Reconciliation', sequenceOrder: 2, status: 'completed', weightagePercent: 20, isCustomerVisible: false },
        { id: 'm3', milestoneName: 'Plant Handover', sequenceOrder: 3, status: 'pending', weightagePercent: 30, isCustomerVisible: true },
      ],
    };

    const customerView: any = WebProjectService.toCustomerSafeView(project);

    // Guaranteed stripping of internal sensitive data
    assert.strictEqual(customerView.internalNotes, undefined);
    assert.strictEqual(customerView.subcontractorCostInr, undefined);

    // Strips non-customer-visible milestones
    assert.strictEqual(customerView.milestones.length, 2);
    assert.strictEqual(customerView.milestones.some((m: any) => m.id === 'm2-internal'), false);
    assert.strictEqual(customerView.projectCode, 'PRJ-2026-999');
  });
});
