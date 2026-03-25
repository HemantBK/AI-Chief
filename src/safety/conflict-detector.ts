/**
 * Conflicting Retrieval Detector
 * Identifies when retrieved sources disagree on the same topic.
 */

import { RetrievedChunk } from '../types.js';
import { embedder } from '../ingestion/embedder.js';
import { cosineSimilarity } from '../rag/router.js';

export interface ConflictReport {
  has_conflicts: boolean;
  conflicts: ConflictPair[];
  consistency_score: number;  // 0-1 (1 = fully consistent)
}

export interface ConflictPair {
  chunk_a: { id: string; source: string; excerpt: string };
  chunk_b: { id: string; source: string; excerpt: string };
  topic: string;
  similarity: number;
}

class ConflictDetector {
  /**
   * Analyze retrieved chunks for internal contradictions
   */
  async analyze(chunks: RetrievedChunk[]): Promise<ConflictReport> {
    if (chunks.length < 2) {
      return { has_conflicts: false, conflicts: [], consistency_score: 1.0 };
    }

    const conflicts: ConflictPair[] = [];
    let pairCount = 0;
    let totalSimilarity = 0;

    // Compare each pair of chunks from different sources
    for (let i = 0; i < chunks.length - 1; i++) {
      for (let j = i + 1; j < chunks.length; j++) {
        const a = chunks[i];
        const b = chunks[j];

        // Skip same-source comparisons
        if (a.chunk.metadata.source_type === b.chunk.metadata.source_type &&
            a.chunk.metadata.source_url === b.chunk.metadata.source_url) {
          continue;
        }

        const embA = await embedder.embed(a.chunk.text);
        const embB = await embedder.embed(b.chunk.text);
        const sim = cosineSimilarity(embA, embB);

        pairCount++;
        totalSimilarity += sim;

        // Both highly relevant to query but dissimilar to each other
        // = potential conflict
        if (a.score > 0.4 && b.score > 0.4 && sim < 0.35) {
          conflicts.push({
            chunk_a: {
              id: a.chunk.id,
              source: `${a.chunk.metadata.source_type}: ${a.chunk.metadata.title}`,
              excerpt: a.chunk.text.slice(0, 150) + '...',
            },
            chunk_b: {
              id: b.chunk.id,
              source: `${b.chunk.metadata.source_type}: ${b.chunk.metadata.title}`,
              excerpt: b.chunk.text.slice(0, 150) + '...',
            },
            topic: extractSharedTopic(a.chunk.text, b.chunk.text),
            similarity: sim,
          });
        }
      }
    }

    const avgSimilarity = pairCount > 0 ? totalSimilarity / pairCount : 1.0;
    // Consistency score: higher average similarity = more consistent
    const consistency_score = Math.min(1.0, Math.max(0.0, avgSimilarity * 1.5));

    return {
      has_conflicts: conflicts.length > 0,
      conflicts,
      consistency_score,
    };
  }
}

function extractSharedTopic(textA: string, textB: string): string {
  const significant = (text: string) => {
    const words = text.toLowerCase().split(/\W+/);
    const stops = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was',
      'were', 'been', 'have', 'has', 'had', 'not', 'but', 'what', 'all', 'can', 'will',
      'when', 'which', 'their', 'there', 'about', 'would', 'could', 'should', 'into',
      'more', 'some', 'than', 'them', 'very', 'also', 'other']);
    return new Set(words.filter(w => w.length > 3 && !stops.has(w)));
  };

  const wordsA = significant(textA);
  const wordsB = significant(textB);
  const shared = [...wordsA].filter(w => wordsB.has(w));

  return shared.slice(0, 4).join(', ') || 'general food science';
}

export const conflictDetector = new ConflictDetector();
