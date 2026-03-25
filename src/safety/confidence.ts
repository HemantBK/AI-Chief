/**
 * Safety Confidence Scoring Algorithm
 *
 * Computes a weighted safety score from 0.0 (dangerous) to 1.0 (safe):
 *   score = 0.35 * pattern_match + 0.25 * source_authority + 0.25 * consistency + 0.15 * hedging
 */

import { CONFIG } from '../config.js';
import { SafetyScore, SafetyFlag, RetrievedChunk } from '../types.js';
import { safetyScanner } from './scanner.js';
import { conflictDetector } from './conflict-detector.js';
import { embedder } from '../ingestion/embedder.js';
import { knowledgeStore } from '../ingestion/loader.js';
import { cosineSimilarity } from '../rag/router.js';

class SafetyConfidence {
  /**
   * Compute full safety confidence score for a response
   */
  async score(
    responseText: string,
    usedChunks: RetrievedChunk[],
    query: string
  ): Promise<SafetyScore> {
    // Run all scoring components
    const [patternScore, flags] = await this.scorePatternMatch(responseText);
    const authorityScore = this.scoreSourceAuthority(usedChunks);
    const consistencyScore = await this.scoreConsistency(usedChunks);
    const hedgingScore = this.scoreHedging(responseText, query);

    // Scanner flags
    const scannerFlags = safetyScanner.scan(responseText);
    const allFlags = [...flags, ...scannerFlags];

    // If there are critical flags, cap the score
    const hasCritical = allFlags.some(f => f.severity === 'critical');
    const hasWarning = allFlags.some(f => f.severity === 'warning');

    let overall = (
      0.35 * patternScore +
      0.25 * authorityScore +
      0.25 * consistencyScore +
      0.15 * hedgingScore
    );

    // Apply penalty for flags
    if (hasCritical) overall = Math.min(overall, 0.25);
    if (hasWarning && !hasCritical) overall = Math.min(overall, 0.65);

    return {
      overall: Math.round(overall * 1000) / 1000,
      pattern_match: Math.round(patternScore * 1000) / 1000,
      source_authority: Math.round(authorityScore * 1000) / 1000,
      consistency: Math.round(consistencyScore * 1000) / 1000,
      hedging: Math.round(hedgingScore * 1000) / 1000,
      flags: allFlags,
    };
  }

  /**
   * Pattern Match Score (0-1, where 1 = no dangerous patterns matched)
   * Checks response against known dangerous advice patterns.
   */
  private async scorePatternMatch(responseText: string): Promise<[number, SafetyFlag[]]> {
    const flags: SafetyFlag[] = [];
    const responseEmbedding = await embedder.embed(responseText);

    // Search safety patterns namespace
    const dangerousPatterns = await knowledgeStore.search(
      CONFIG.NS.SAFETY_PATTERNS,
      responseEmbedding,
      10
    );

    if (dangerousPatterns.length === 0) {
      return [1.0, flags];
    }

    // Find highest similarity to any dangerous pattern
    let maxSimilarity = 0;
    for (const pattern of dangerousPatterns) {
      if (pattern.score > maxSimilarity) {
        maxSimilarity = pattern.score;
      }
      if (pattern.score > CONFIG.DANGEROUS_PATTERN_THRESHOLD) {
        flags.push({
          severity: 'critical',
          category: 'dangerous-pattern',
          message: `Response matches dangerous pattern: "${pattern.value.slice(0, 80)}..." (similarity: ${pattern.score.toFixed(3)})`,
        });
      }
    }

    // Linear interpolation: similarity > 0.7 -> score 0, similarity < 0.3 -> score 1
    const score = maxSimilarity > CONFIG.DANGEROUS_PATTERN_THRESHOLD
      ? 0.0
      : maxSimilarity < 0.3
        ? 1.0
        : 1.0 - ((maxSimilarity - 0.3) / 0.4);

    return [score, flags];
  }

  /**
   * Source Authority Score (0-1)
   * Based on the authority of cited sources.
   */
  private scoreSourceAuthority(chunks: RetrievedChunk[]): number {
    if (chunks.length === 0) return 0.5;

    let totalAuthority = 0;
    for (const chunk of chunks) {
      const sourceType = chunk.chunk.metadata.source_type;
      totalAuthority += CONFIG.SOURCE_AUTHORITY[sourceType] || CONFIG.SOURCE_AUTHORITY.unknown;
    }

    return totalAuthority / chunks.length;
  }

  /**
   * Consistency Score (0-1)
   * Measures agreement among retrieved sources.
   */
  private async scoreConsistency(chunks: RetrievedChunk[]): Promise<number> {
    const report = await conflictDetector.analyze(chunks);
    return report.consistency_score;
  }

  /**
   * Hedging Score (0-1)
   * Checks for appropriate hedging language in safety-critical responses.
   */
  private scoreHedging(responseText: string, query: string): number {
    const lower = responseText.toLowerCase();
    const queryLower = query.toLowerCase();

    // Determine if this is a safety-critical query
    const safetyKeywords = ['safe', 'danger', 'risk', 'temperature', 'raw', 'undercooked',
      'expire', 'spoil', 'toxic', 'poison', 'allergen', 'allergy', 'pregnant',
      'bacteria', 'contamina', 'food borne', 'foodborne'];
    const isSafetyCritical = safetyKeywords.some(k => queryLower.includes(k));

    if (!isSafetyCritical) return 1.0; // Non-safety queries don't need hedging

    // Check for hedging phrases
    const hedgingPhrases = [
      'consult', 'healthcare', 'doctor', 'medical professional',
      'usda recommend', 'fda recommend', 'fda guideline', 'usda guideline',
      'when in doubt', 'err on the side of caution', 'to be safe',
      'individual', 'may vary', 'depends on',
      'food thermometer', 'internal temperature',
      'important to note', 'keep in mind', 'please note',
      '⚠️', 'warning', 'caution',
    ];

    const hedgesFound = hedgingPhrases.filter(phrase => lower.includes(phrase));
    const hedgeRatio = hedgesFound.length / 3; // Expect at least 3 hedging phrases for safety topics

    return Math.min(1.0, hedgeRatio);
  }
}

export const safetyConfidence = new SafetyConfidence();
