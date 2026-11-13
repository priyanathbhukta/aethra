// ==============================================================================
// AETHRA Mobile — Field Technician Home Screen Controller
// ==============================================================================

import { MobileHomeFeedItem } from '../types/mobile.types.js';
import { OfflineMutationQueue } from '../offline/syncQueue.js';
import { MobileBffClient } from '../services/mobileBffClient.js';

export class TechnicianHomeScreenController {
  constructor(
    private readonly queue: OfflineMutationQueue,
    private readonly bffClient: MobileBffClient
  ) {}

  /**
   * Loads technician dispatch feed and pending offline mutation status.
   */
  async getScreenState(): Promise<{
    feedItems: MobileHomeFeedItem[];
    pendingSyncCount: number;
    isSyncRequired: boolean;
  }> {
    const feedItems = await this.bffClient.getHomeFeed();
    const pendingSyncCount = this.queue.size;

    return {
      feedItems,
      pendingSyncCount,
      isSyncRequired: pendingSyncCount > 0,
    };
  }

  /**
   * Triggers manual synchronization of pending field records.
   */
  async triggerSync(): Promise<{ syncedCount: number; remainingCount: number }> {
    const pending = this.queue.getPendingMutations();
    if (pending.length === 0) {
      return { syncedCount: 0, remainingCount: 0 };
    }

    const result = await this.bffClient.syncBatch(pending);

    for (const m of pending) {
      this.queue.markSynced(m.clientMutationId);
    }

    return {
      syncedCount: result.processedCount,
      remainingCount: this.queue.size,
    };
  }
}
