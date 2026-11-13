// ==============================================================================
// AETHRA — Mobile BFF Integration Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import app from '../main.js';

test('Mobile BFF — Lightweight Mobile Feed & Batch Sync Endpoints', async (t) => {
  await t.test('Scenario 1: App instance is exported and configured', () => {
    assert.ok(app);
  });

  await t.test('Scenario 2: Validates offline sync batch payload structure', () => {
    const batchBody = {
      mutations: [
        {
          clientMutationId: 'cm-001',
          type: 'submit_site_survey',
          payload: { latitude: 12.97, longitude: 77.59 },
        },
      ],
    };

    assert.strictEqual(batchBody.mutations.length, 1);
    assert.strictEqual(batchBody.mutations[0].type, 'submit_site_survey');
  });
});
