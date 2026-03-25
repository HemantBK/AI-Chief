/**
 * Agent Coordinator
 * Orchestrates the multi-agent flow:
 *   User Question -> Chef Agent -> (Safety Reviewer + Citation Verifier) -> Final Response
 *
 * Star topology: coordinator is the hub, agents are leaves.
 */

import { CONFIG } from '../config.js';
import { chefAgent } from './chef.js';
import { safetyReviewer } from './safety-reviewer.js';
import { citationVerifier } from './citation-verifier.js';
import { AskResponse, SafetyFlag } from '../types.js';
import { metricsCollector } from '../monitoring/metrics.js';
import { v4 as uuidv4 } from 'uuid';

class AgentCoordinator {
  private maxRetries = 2;

  /**
   * Process a user question through the full agent pipeline
   */
  async processQuestion(question: string): Promise<AskResponse> {
    const startTime = Date.now();
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[Coordinator] New question: "${question}"`);
    console.log('='.repeat(60));

    let attempt = 0;
    let lastVetoReason = '';

    while (attempt <= this.maxRetries) {
      attempt++;
      console.log(`[Coordinator] Attempt ${attempt}/${this.maxRetries + 1}`);

      // Step 1: Chef generates answer
      const chefResponse = attempt === 1
        ? await chefAgent.answer(question)
        : await chefAgent.answerWithSafetyConstraints(question, [lastVetoReason]);

      // Step 2: Run Safety Review and Citation Verification in parallel
      const [safetyResult, citationResult] = await Promise.all([
        safetyReviewer.review(chefResponse.answer, chefResponse.raw_chunks, question),
        citationVerifier.verify(chefResponse.answer, chefResponse.citations, chefResponse.raw_chunks),
      ]);

      // Step 3: Handle veto
      if (safetyResult.veto && attempt <= this.maxRetries) {
        console.log(`[Coordinator] VETO: ${safetyResult.veto_reason}`);
        lastVetoReason = safetyResult.veto_reason || 'safety concerns';
        continue; // Retry with safety constraints
      }

      // Step 4: Handle invalid citations — strip them
      let finalAnswer = chefResponse.answer;
      if (citationResult.invalid_citations.length > 0) {
        console.log(`[Coordinator] Stripping invalid citations: ${citationResult.invalid_citations}`);
        for (const idx of citationResult.invalid_citations) {
          finalAnswer = finalAnswer.replace(new RegExp(`\\[${idx}\\]`, 'g'), '');
        }
        if (citationResult.warnings.length > 0) {
          // Don't expose internal warnings to user, just clean up
          finalAnswer = finalAnswer.replace(/\s{2,}/g, ' ');
        }
      }

      // Step 5: Collect all safety flags
      const allFlags: SafetyFlag[] = [...safetyResult.flags];

      // Step 6: Compile response
      const responseTime = Date.now() - startTime;

      const response: AskResponse = {
        query_id: uuidv4(),
        answer: finalAnswer,
        citations: chefResponse.citations.filter(
          c => !citationResult.invalid_citations.includes(c.index)
        ),
        safety_score: safetyResult.score.overall,
        safety_flags: allFlags,
        conflict_detected: chefResponse.raw_chunks.length > 0 &&
          finalAnswer.includes('different perspectives'),
        categories_searched: [...new Set(chefResponse.raw_chunks.map(c => c.chunk.metadata.category))],
        response_time_ms: responseTime,
      };

      // Step 7: Log metrics
      await metricsCollector.record({
        timestamp: new Date().toISOString(),
        query: question,
        categories_routed: response.categories_searched,
        chunks_retrieved: chefResponse.raw_chunks.length,
        safety_score: response.safety_score,
        safety_flags: allFlags.map(f => `${f.severity}:${f.message}`),
        citation_count: response.citations.length,
        invalid_citations: citationResult.invalid_citations.length,
        conflict_detected: response.conflict_detected,
        response_time_ms: responseTime,
      });

      console.log(`[Coordinator] Done in ${responseTime}ms. Safety: ${response.safety_score}`);
      return response;
    }

    // Fallback if all retries exhausted (should not normally reach here)
    const responseTime = Date.now() - startTime;
    return {
      query_id: uuidv4(),
      answer: "I apologize, but I'm having difficulty generating a safe and accurate response to this question. For food safety questions, please consult the USDA Food Safety and Inspection Service (FSIS) at fsis.usda.gov or call their hotline at 1-888-674-6854.",
      citations: [],
      safety_score: 0,
      safety_flags: [{
        severity: 'critical',
        category: 'system',
        message: 'Response vetoed after maximum retries',
      }],
      conflict_detected: false,
      categories_searched: [],
      response_time_ms: responseTime,
    };
  }
}

export const coordinator = new AgentCoordinator();
