// ==============================================================================
// AETHRA Mobile — Field Technician Visit Service & Spare Serial Tracker
// ==============================================================================

import crypto from 'node:crypto';
import { MobileTechnicianVisit } from '../types/mobile.types.js';
import { OfflineMutationQueue } from '../offline/syncQueue.js';

export class TechnicianVisitService {
  constructor(private readonly queue: OfflineMutationQueue) {}

  /**
   * Records technician service visit, captures replaced parts with serial tracking,
   * and queues locally if device is offline.
   */
  recordVisit(
    visit: Omit<MobileTechnicianVisit, 'visitId' | 'completedAt'>,
    isOnline = false
  ): { visitId: string; queuedLocally: boolean; visit: MobileTechnicianVisit } {
    if (!visit.workDescription || visit.workDescription.trim().length === 0) {
      throw new Error('Work description is required');
    }

    if (visit.sparePartReplaced) {
      const { oldSerialNumber, newSerialNumber } = visit.sparePartReplaced;
      if (!oldSerialNumber || !newSerialNumber) {
        throw new Error('Both old and new serial numbers are mandatory for spare part replacement tracking');
      }
      if (oldSerialNumber.trim() === newSerialNumber.trim()) {
        throw new Error('New serial number cannot be identical to replaced faulty serial number');
      }
    }

    if (visit.customerRatingStars !== undefined) {
      if (visit.customerRatingStars < 1 || visit.customerRatingStars > 5) {
        throw new Error('Customer rating must be between 1 and 5 stars');
      }
    }

    const visitId = crypto.randomUUID();
    const completedVisit: MobileTechnicianVisit = {
      ...visit,
      visitId,
      completedAt: new Date().toISOString(),
    };

    if (!isOnline) {
      this.queue.enqueue('record_technician_visit', visitId, completedVisit);
      return { visitId, queuedLocally: true, visit: completedVisit };
    }

    return { visitId, queuedLocally: false, visit: completedVisit };
  }
}
