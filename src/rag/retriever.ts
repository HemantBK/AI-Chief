/**
 * Multi-Namespace Retriever
 * Searches across multiple knowledge namespaces and merges results.
 */

import { CONFIG } from '../config.js';
import { embedder } from '../ingestion/embedder.js';
import { knowledgeStore } from '../ingestion/loader.js';
import { RetrievedChunk, DocumentChunk, ChunkMetadata } from '../types.js';

class Retriever {
  /**
   * Search across specified namespaces for relevant chunks
   */
  async retrieve(
    query: string,
    namespaces: string[],
    topKPerNamespace: number = CONFIG.RETRIEVAL_TOP_K
  ): Promise<RetrievedChunk[]> {
    const queryEmbedding = await embedder.embed(query);
    const allResults: RetrievedChunk[] = [];

    for (const ns of namespaces) {
      const results = await knowledgeStore.search(ns, queryEmbedding, topKPerNamespace);

      for (const result of results) {
        // Parse the stored value back into a chunk
        let metadata: ChunkMetadata;
        try {
          const parsed = JSON.parse(result.value);
          metadata = parsed.metadata || parseMetadataFromTags(result.tags, ns);
        } catch {
          metadata = parseMetadataFromTags(result.tags, ns);
        }

        const chunk: DocumentChunk = {
          id: result.key,
          text: extractText(result.value),
          metadata,
        };

        allResults.push({
          chunk,
          score: result.score,
          namespace: ns,
        });
      }
    }

    // Sort all results by score descending
    allResults.sort((a, b) => b.score - a.score);

    console.log(`[Retriever] Found ${allResults.length} chunks across ${namespaces.length} namespaces`);
    return allResults;
  }

  /**
   * Search across ALL namespaces
   */
  async retrieveAll(query: string, topK: number = 10): Promise<RetrievedChunk[]> {
    const allNamespaces = Object.values(CONFIG.NS).filter(
      ns => !['query-log', 'metrics', 'safety-patterns'].includes(ns)
    );
    return this.retrieve(query, allNamespaces, topK);
  }
}

/**
 * Extract the text content from a stored value
 * Handles both JSON-wrapped and plain text formats
 */
function extractText(value: string): string {
  try {
    const parsed = JSON.parse(value);
    return parsed.text || parsed.content || value;
  } catch {
    return value;
  }
}

/**
 * Reconstruct metadata from tags when full metadata isn't available
 */
function parseMetadataFromTags(tags: string[], namespace: string): ChunkMetadata {
  const categoryMap: Record<string, string> = {
    'food-chemistry': 'chemistry',
    'food-safety': 'safety',
    'cooking-technique': 'technique',
    'nutrition-data': 'nutrition',
  };

  return {
    source_url: tags.find(t => t.startsWith('http')) || '',
    source_type: (tags.find(t => ['usda', 'fda', 'paper', 'lecture'].includes(t)) as any) || 'unknown',
    category: (categoryMap[namespace] as any) || 'chemistry',
    title: tags.find(t => !['usda', 'fda', 'paper', 'lecture'].includes(t) && !t.startsWith('http')) || 'Unknown',
    author: '',
    date: '',
    chunk_index: 0,
    total_chunks: 1,
  };
}

export const retriever = new Retriever();
