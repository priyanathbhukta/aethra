// ==============================================================================
// AETHRA Mobile — Offline Mutation Queue & Background Sync Engine
// ==============================================================================

import crypto from 'node:crypto';
import { OfflineMutation, MutationType } from '../types/mobile.types.js';

export class OfflineMutationQueue {
  private queue: Map<string, OfflineMutation> = new Map();

  /**
   * Enqueues an action performed while offline (e.g. site survey, technician visit log).
   */
  enqueue<T>(type: MutationType, entityId: string, payload: T): OfflineMutation<T> {
    const clientMutationId = crypto.randomUUID();
    const mutation: OfflineMutation<T> = {
      clientMutationId,
      type,
      entityId,
      payload,
      timestamp: new Date().toISOString(),
      status: 'pending',
      retryCount: 0,
    };

    this.queue.set(clientMutationId, mutation);
    return mutation;
  }

  /**
   * Retrieves all pending mutations ready for replay to Mobile BFF.
   */
  getPendingMutations(): OfflineMutation[] {
    return Array.from(this.queue.values()).filter(
      (m) => m.status === 'pending' || (m.status === 'failed' && m.retryCount < 5)
    );
  }

  /**
   * Marks a mutation as successfully synced and removes it from pending queue.
   */
  markSynced(clientMutationId: string): void {
    const existing = this.queue.get(clientMutationId);
    if (existing) {
      existing.status = 'synced';
    }
  }

  /**
   * Records a synchronization failure and increments the retry count.
   */
  recordFailure(clientMutationId: string, error: string): void {
    const existing = this.queue.get(clientMutationId);
    if (existing) {
      existing.status = 'failed';
      existing.retryCount += 1;
      existing.lastError = error;
    }
  }

  /**
   * Number of items currently queued.
   */
  get size(): number {
    return Array.from(this.queue.values()).filter((m) => m.status === 'pending').length;
  }

  /**
   * Clears all queue items (for testing).
   */
  clear(): void {
    this.queue.clear();
  }
}
