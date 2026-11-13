// ==============================================================================
// AETHRA Mobile — Site Survey Service Unit Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import { OfflineMutationQueue } from '../offline/syncQueue.js';
import { MobileSurveyService } from '../services/mobileSurveyService.js';

test('Mobile App — Site Survey Geo-tagging & Roof Validation', async (t) => {
  await t.test('Scenario 1: Captures valid Bangalore rooftop survey and queues offline', () => {
    const queue = new OfflineMutationQueue();
    const service = new MobileSurveyService(queue);

    const surveyData = {
      customerId: 'cust-blr-01',
      technicianUserId: 'usr-tech-arun',
      siteAddress: '142 Indiranagar, Bangalore',
      latitude: 12.9716, // Bangalore valid latitude
      longitude: 77.5946, // Bangalore valid longitude
      roofType: 'rcc_flat' as const,
      totalRoofAreaSqFt: 1500,
      usableShadowFreeAreaSqFt: 1200,
      sanctionedLoadKw: 10.0,
      discomName: 'BESCOM',
      discomConsumerNumber: 'BES-IND-9912',
      sitePhotoDocIds: ['doc-roof-01', 'doc-meter-01'],
    };

    const result = service.captureSurvey(surveyData, false); // offline

    assert.ok(result.surveyId);
    assert.strictEqual(result.queuedLocally, true);
    assert.strictEqual(queue.size, 1);
  });

  await t.test('Scenario 2: Rejects survey when usable shadow-free area exceeds total roof area', () => {
    const queue = new OfflineMutationQueue();
    const service = new MobileSurveyService(queue);

    const invalidSurvey = {
      customerId: 'cust-blr-02',
      technicianUserId: 'usr-tech-arun',
      siteAddress: 'Whitefield, Bangalore',
      latitude: 12.9698,
      longitude: 77.7500,
      roofType: 'rcc_flat' as const,
      totalRoofAreaSqFt: 1000,
      usableShadowFreeAreaSqFt: 1500, // Invalid! > total roof area
      sanctionedLoadKw: 5.0,
      discomName: 'BESCOM',
      discomConsumerNumber: 'BES-WF-001',
      sitePhotoDocIds: [],
    };

    assert.throws(
      () => service.captureSurvey(invalidSurvey, false),
      /Shadow-free roof area cannot exceed total roof area/
    );
  });

  await t.test('Scenario 3: Rejects GPS coordinates outside India territory boundaries', () => {
    const queue = new OfflineMutationQueue();
    const service = new MobileSurveyService(queue);

    const outOfBoundsSurvey = {
      customerId: 'cust-blr-03',
      technicianUserId: 'usr-tech-arun',
      siteAddress: 'International location',
      latitude: 51.5074, // London latitude
      longitude: -0.1278, // London longitude
      roofType: 'rcc_flat' as const,
      totalRoofAreaSqFt: 1000,
      usableShadowFreeAreaSqFt: 800,
      sanctionedLoadKw: 5.0,
      discomName: 'BESCOM',
      discomConsumerNumber: 'BES-001',
      sitePhotoDocIds: [],
    };

    assert.throws(
      () => service.captureSurvey(outOfBoundsSurvey, false),
      /outside India territory bounds/
    );
  });
});
