// ==============================================================================
// AETHRA Mobile — Technician Visit & Spare Serial Tracking Unit Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import { OfflineMutationQueue } from '../offline/syncQueue.js';
import { TechnicianVisitService } from '../services/technicianVisitService.js';

test('Mobile App — Technician Visit & Spare Serial Number Validation', async (t) => {
  await t.test('Scenario 1: Captures valid visit with replaced inverter serial number tracking', () => {
    const queue = new OfflineMutationQueue();
    const service = new TechnicianVisitService(queue);

    const visitData = {
      ticketId: 'tkt-inv-fault-01',
      technicianUserId: 'usr-tech-suresh',
      workDescription: 'Replaced faulty string inverter with warranty spare unit. Recalibrated AC output.',
      faultIdentified: 'IGBT breakdown under lightning surge',
      sparePartReplaced: {
        partType: 'inverter' as const,
        oldSerialNumber: 'INV-2024-FAULTY-881',
        newSerialNumber: 'INV-2026-SPARE-992',
        warrantyClaimed: true,
      },
      resolutionStatus: 'resolved' as const,
      customerRatingStars: 5,
      customerFeedback: 'Technician arrived on time and resolved problem quickly.',
    };

    const result = service.recordVisit(visitData, false);

    assert.ok(result.visitId);
    assert.strictEqual(result.queuedLocally, true);
    assert.strictEqual(queue.size, 1);
  });

  await t.test('Scenario 2: Rejects replacement when new serial equals old faulty serial', () => {
    const queue = new OfflineMutationQueue();
    const service = new TechnicianVisitService(queue);

    const invalidVisit = {
      ticketId: 'tkt-002',
      technicianUserId: 'usr-tech-suresh',
      workDescription: 'Checked inverter',
      faultIdentified: 'No fault',
      sparePartReplaced: {
        partType: 'inverter' as const,
        oldSerialNumber: 'SAME-SERIAL-123',
        newSerialNumber: 'SAME-SERIAL-123', // Invalid! Must be different
        warrantyClaimed: false,
      },
      resolutionStatus: 'resolved' as const,
    };

    assert.throws(
      () => service.recordVisit(invalidVisit, false),
      /New serial number cannot be identical/
    );
  });

  await t.test('Scenario 3: Validates customer feedback rating is within 1 to 5 range', () => {
    const queue = new OfflineMutationQueue();
    const service = new TechnicianVisitService(queue);

    const invalidRatingVisit = {
      ticketId: 'tkt-003',
      technicianUserId: 'usr-tech-suresh',
      workDescription: 'Routine checkup',
      faultIdentified: 'None',
      resolutionStatus: 'resolved' as const,
      customerRatingStars: 6, // Invalid! Max is 5
    };

    assert.throws(
      () => service.recordVisit(invalidRatingVisit, false),
      /Customer rating must be between 1 and 5 stars/
    );
  });
});
