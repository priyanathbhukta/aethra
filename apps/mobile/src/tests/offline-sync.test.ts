// ==============================================================================
// AETHRA Mobile — Offline Mutation Queue & Sync Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import { OfflineMutationQueue } from '../offline/syncQueue.js';
import { TechnicianHomeScreenController } from '../screens/TechnicianHomeScreen.js';
import { MobileBffClient } from '../services/mobileBffClient.js';

test('Mobile App — Offline Mutation Queue & Sync Engine', async (t) => {
  await t.test('Scenario 1: Enqueues mutations with clientMutationId and tracks pending status', () => {
    const queue = new OfflineMutationQueue();

    const m1 = queue.enqueue('submit_site_survey', 'surv-001', { roofArea: 1000 });
    const m2 = queue.enqueue('record_technician_visit', 'tkt-001', { rating: 5 });

    assert.strictEqual(queue.size, 2);
    assert.ok(m1.clientMutationId);
    assert.strictEqual(m1.status, 'pending');
    assert.strictEqual(m2.status, 'pending');

    const pending = queue.getPendingMutations();
    assert.strictEqual(pending.length, 2);
  });

  await t.test('Scenario 2: Sync replay marks mutations as synced and clears pending count', async () => {
    const queue = new OfflineMutationQueue();
    const bffClient = new MobileBffClient();
    const controller = new TechnicianHomeScreenController(queue, bffClient);

    queue.enqueue('submit_site_survey', 'surv-101', { roofArea: 800 });
    queue.enqueue('upload_site_photo', 'photo-101', { docId: 'doc-99' });

    const stateBefore = await controller.getScreenState();
    assert.strictEqual(stateBefore.pendingSyncCount, 2);
    assert.strictEqual(stateBefore.isSyncRequired, true);

    // Trigger sync
    const syncResult = await controller.triggerSync();
    assert.strictEqual(syncResult.syncedCount, 2);

    const stateAfter = await controller.getScreenState();
    assert.strictEqual(stateAfter.pendingSyncCount, 0);
    assert.strictEqual(stateAfter.isSyncRequired, false);
  });

  await t.test('Scenario 3: Records failure and tracks retry count for network faults', () => {
    const queue = new OfflineMutationQueue();
    const m = queue.enqueue('submit_site_survey', 'surv-fail', { roofArea: 500 });

    queue.recordFailure(m.clientMutationId, 'Network connection timed out');

    const pending = queue.getPendingMutations();
    assert.strictEqual(pending.length, 1);
    assert.strictEqual(pending[0].status, 'failed');
    assert.strictEqual(pending[0].retryCount, 1);
    assert.strictEqual(pending[0].lastError, 'Network connection timed out');
  });
});
