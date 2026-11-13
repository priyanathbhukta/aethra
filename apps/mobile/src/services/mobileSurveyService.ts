// ==============================================================================
// AETHRA Mobile — Site Survey Service
// ==============================================================================

import crypto from 'node:crypto';
import { MobileSiteSurvey } from '../types/mobile.types.js';
import { OfflineMutationQueue } from '../offline/syncQueue.js';

export class MobileSurveyService {
  constructor(private readonly queue: OfflineMutationQueue) {}

  /**
   * Validates and records a rooftop site survey conducted by field technician.
   * If offline, enqueues the mutation into local sync queue.
   */
  captureSurvey(
    survey: Omit<MobileSiteSurvey, 'surveyId' | 'surveyedAt'>,
    isOnline = false
  ): { surveyId: string; queuedLocally: boolean; survey: MobileSiteSurvey } {
    // 1. Validation
    if (survey.totalRoofAreaSqFt <= 0) {
      throw new Error('Total roof area must be greater than zero');
    }

    if (survey.usableShadowFreeAreaSqFt > survey.totalRoofAreaSqFt) {
      throw new Error('Shadow-free roof area cannot exceed total roof area');
    }

    if (survey.sanctionedLoadKw <= 0) {
      throw new Error('Sanctioned load must be greater than zero');
    }

    // Coordinates sanity check (India geographic bounding box: ~6°N to 37°N, ~68°E to 97°E)
    if (survey.latitude < 6.0 || survey.latitude > 37.5 || survey.longitude < 68.0 || survey.longitude > 97.5) {
      throw new Error(`Coordinates [${survey.latitude}, ${survey.longitude}] outside India territory bounds`);
    }

    const surveyId = crypto.randomUUID();
    const completedSurvey: MobileSiteSurvey = {
      ...survey,
      surveyId,
      surveyedAt: new Date().toISOString(),
    };

    if (!isOnline) {
      this.queue.enqueue('submit_site_survey', surveyId, completedSurvey);
      return { surveyId, queuedLocally: true, survey: completedSurvey };
    }

    return { surveyId, queuedLocally: false, survey: completedSurvey };
  }
}
