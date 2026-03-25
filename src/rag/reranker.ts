/**
 * Result Reranker & Conflict Detector
 * Re-scores retrieved chunks and detects contradictory information.
 */

import { CONFIG } from '../config.js';
import { embedder } from '../ingestion/embedder.js';
import { RetrievedChunk } from '../types.js';
import { cosineSimilarity } from './router.js';

interface RerankedResult {
  chunks: RetrievedChunk[];
  conflict_detected: boolean;
  conflicting_topics: string[];
}

class Reranker {
  /**
   * Rerank chunks by query relevance and detect conflicts
   */
  async rerank(
    query: string,
    chunks: RetrievedChunk[],
    topK: number = CONFIG.RETRIEVAL_TOP_K
  ): Promise<RerankedResult> {
    if (chunks.length === 0) {
      return { chunks: [], conflict_detected: false, conflicting_topics: [] };
    }

    const queryEmbedding = await embedder.embed(query);

    // Re-score each chunk against the query
    const rescored = await Promise.all(
      chunks.map(async (chunk) => {
        const chunkEmbedding = await embedder.embed(chunk.chunk.text);
        const relevanceScore = cosineSimilarity(queryEmbedding, chunkEmbedding);

        // Boost score by source authority
        const authorityBoost = CONFIG.SOURCE_AUTHORITY[chunk.chunk.metadata.source_type] || 0.5;

        return {
          ...chunk,
          score: relevanceScore * 0.7 + authorityBoost * 0.3,
          relevanceScore,
        };
      })
    );

    // Sort by combined score
    rescored.sort((a, b) => b.score - a.score);
    const topChunks = rescored.slice(0, topK);

    // Detect conflicts among top chunks
    const { conflict_detected, conflicting_topics } = await this.detectConflicts(topChunks);

    console.log(`[Reranker] Reranked ${chunks.length} -> ${topChunks.length} chunks. Conflicts: ${conflict_detected}`);

    return {
      chunks: topChunks,
      conflict_detected,
      conflicting_topics,
    };
  }

  /**
   * Detect if top chunks contain contradictory information
   *
   * Strategy: If chunks from different sources discuss the same topic
   * but have low mutual similarity, they may contradict each other.
   */
  private async detectConflicts(
    chunks: RetrievedChunk[]
  ): Promise<{ conflict_detected: boolean; conflicting_topics: string[] }> {
    const conflicting_topics: string[] = [];

    if (chunks.length < 2) {
      return { conflict_detected: false, conflicting_topics };
    }

    // Compare pairs of chunks from different sources
    for (let i = 0; i < chunks.length - 1; i++) {
      for (let j = i + 1; j < chunks.length; j++) {
        const a = chunks[i];
        const b = chunks[j];

        // Only check chunks from different sources
        if (a.chunk.metadata.source_type === b.chunk.metadata.source_type) continue;

        // Check if they discuss similar topics (both relevant to query)
        // but from different angles
        if (a.score > 0.5 && b.score > 0.5) {
          const embA = await embedder.embed(a.chunk.text);
          const embB = await embedder.embed(b.chunk.text);
          const mutualSim = cosineSimilarity(embA, embB);

          // High individual relevance but low mutual similarity = potential conflict
          if (mutualSim < 0.4) {
            const topic = extractTopic(a.chunk.text, b.chunk.text);
            if (topic && !conflicting_topics.includes(topic)) {
              conflicting_topics.push(topic);
            }
          }
        }
      }
    }

    return {
      conflict_detected: conflicting_topics.length > 0,
      conflicting_topics,
    };
  }
}

/**
 * Extract the likely topic of disagreement between two texts
 */
function extractTopic(textA: string, textB: string): string {
  // Find common significant words between the two texts
  const wordsA = new Set(textA.toLowerCase().split(/\W+/).filter(w => w.length > 4));
  const wordsB = new Set(textB.toLowerCase().split(/\W+/).filter(w => w.length > 4));

  const common = [...wordsA].filter(w => wordsB.has(w));
  const stopWords = new Set(['about', 'which', 'would', 'could', 'should', 'their', 'there', 'these', 'those', 'being', 'between', 'through']);
  const significant = common.filter(w => !stopWords.has(w));

  return significant.slice(0, 3).join(', ') || '';
}

export const reranker = new Reranker();
