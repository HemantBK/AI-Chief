/**
 * Citation Verifier Agent
 * Checks that each citation in the response actually supports the claim.
 */

import { Citation, CitationVerifyResult, RetrievedChunk } from '../types.js';
import { embedder } from '../ingestion/embedder.js';
import { cosineSimilarity } from '../rag/router.js';

class CitationVerifierAgent {
  /**
   * Verify all citations in a response
   */
  async verify(
    responseText: string,
    citations: Citation[],
    usedChunks: RetrievedChunk[]
  ): Promise<CitationVerifyResult> {
    console.log(`[CitationVerifier] Verifying ${citations.length} citations...`);

    const valid_citations: number[] = [];
    const invalid_citations: number[] = [];
    const warnings: string[] = [];

    // Extract cited claims from the response
    const citedClaims = this.extractCitedClaims(responseText);

    for (const citation of citations) {
      const citIdx = citation.index;
      const claim = citedClaims.get(citIdx);

      if (!claim) {
        // Citation exists but no claim references it
        warnings.push(`Citation [${citIdx}] is listed but not referenced in the response`);
        continue;
      }

      // Find the source chunk for this citation
      const sourceChunk = usedChunks.find(c =>
        (c.chunk.metadata.source_url === citation.source_url) ||
        (c.chunk.metadata.title === citation.title)
      );

      if (!sourceChunk) {
        invalid_citations.push(citIdx);
        warnings.push(`Citation [${citIdx}]: Source chunk not found in retrieved documents`);
        continue;
      }

      // Check semantic alignment between claim and source
      const claimEmbedding = await embedder.embed(claim);
      const sourceEmbedding = await embedder.embed(sourceChunk.chunk.text);
      const alignment = cosineSimilarity(claimEmbedding, sourceEmbedding);

      if (alignment > 0.35) {
        valid_citations.push(citIdx);
      } else {
        invalid_citations.push(citIdx);
        warnings.push(
          `Citation [${citIdx}]: Low alignment (${alignment.toFixed(3)}) between claim "${claim.slice(0, 60)}..." and source "${sourceChunk.chunk.text.slice(0, 60)}..."`
        );
      }
    }

    console.log(`[CitationVerifier] Valid: ${valid_citations.length}, Invalid: ${invalid_citations.length}`);

    return { valid_citations, invalid_citations, warnings };
  }

  /**
   * Extract text segments associated with each citation number
   */
  private extractCitedClaims(responseText: string): Map<number, string> {
    const claims = new Map<number, string>();

    // Find all citation references like [1], [2], etc.
    const citPattern = /\[(\d+)\]/g;
    let match;

    // Pre-split into sentences more carefully (handle abbreviations)
    const sentenceBoundary = /(?<!\b(?:Dr|Mr|Mrs|Ms|Prof|U\.S|vs|etc|approx|temp|min|max|avg|dept|govt|oz|lb|tsp|tbsp))\.\s+(?=[A-Z])/g;

    while ((match = citPattern.exec(responseText)) !== null) {
      const citIdx = parseInt(match[1]);
      const pos = match.index;

      // Extract surrounding context as the "claim"
      // Look backward to the start of the sentence (using safer boundary detection)
      const textBefore = responseText.slice(0, pos);
      const lastBoundary = textBefore.search(/[.!?]\s+(?=[A-Z])[^.]*$/);
      let sentenceStart = lastBoundary === -1 ? Math.max(0, pos - 200) : lastBoundary + 1;

      // Look forward to the end of the sentence
      const textAfter = responseText.slice(pos + match[0].length);
      const nextBoundary = textAfter.search(/[.!?]\s+(?=[A-Z])/);
      let sentenceEnd = nextBoundary === -1
        ? Math.min(responseText.length, pos + 200)
        : pos + match[0].length + nextBoundary + 1;

      const claim = responseText.slice(sentenceStart, sentenceEnd).trim();

      // Keep the longest claim for each citation
      if (!claims.has(citIdx) || claim.length > (claims.get(citIdx)?.length || 0)) {
        claims.set(citIdx, claim);
      }
    }

    return claims;
  }
}

export const citationVerifier = new CitationVerifierAgent();
