/**
 * Safety Reviewer Agent
 * Reviews every Chef response for potentially dangerous advice.
 * Can VETO responses that fall below safety thresholds.
 */

import { CONFIG } from '../config.js';
import { safetyConfidence, safetyAdaptation, safetyScanner } from '../safety/index.js';
import { SafetyReviewResult, SafetyFlag, RetrievedChunk } from '../types.js';

class SafetyReviewerAgent {
  /**
   * Review a Chef response for safety
   */
  async review(
    responseText: string,
    usedChunks: RetrievedChunk[],
    query: string
  ): Promise<SafetyReviewResult> {
    console.log('[SafetyReviewer] Reviewing response...');

    // Compute safety confidence score
    const score = await safetyConfidence.score(responseText, usedChunks, query);

    // Get adaptive threshold (may be higher than default if recent queries have been risky)
    const threshold = safetyAdaptation.getThreshold();

    // Determine if response should be vetoed
    const veto = score.overall < CONFIG.SAFETY_VETO_THRESHOLD;
    const safe = score.overall >= threshold;

    // Adapt based on this score
    await safetyAdaptation.adapt(score.overall);

    const result: SafetyReviewResult = {
      safe,
      score,
      flags: score.flags,
      veto,
      veto_reason: veto
        ? `Safety score ${score.overall} is below veto threshold ${CONFIG.SAFETY_VETO_THRESHOLD}. Critical flags: ${score.flags.filter(f => f.severity === 'critical').map(f => f.message).join('; ')}`
        : undefined,
    };

    console.log(`[SafetyReviewer] Score: ${score.overall}, Safe: ${safe}, Veto: ${veto}, Flags: ${score.flags.length}`);
    return result;
  }

  /**
   * Quick safety check without full scoring (for pre-screening)
   */
  quickCheck(responseText: string): { pass: boolean; criticalFlags: string[] } {
    const flags: SafetyFlag[] = safetyScanner.scan(responseText);
    const criticalFlags = flags
      .filter(f => f.severity === 'critical')
      .map(f => f.message);

    return {
      pass: criticalFlags.length === 0,
      criticalFlags,
    };
  }
}

export const safetyReviewer = new SafetyReviewerAgent();
