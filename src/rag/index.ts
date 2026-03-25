/**
 * RAG Engine Orchestrator
 * Coordinates routing -> retrieval -> reranking -> citation for each query.
 */

import { CONFIG } from '../config.js';
import { router } from './router.js';
import { retriever } from './retriever.js';
import { reranker } from './reranker.js';
import { citationManager } from './citation.js';
import { RAGContext, Citation } from '../types.js';

class RAGEngine {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await router.initialize();
    this.initialized = true;
    console.log('[RAG] Engine initialized');
  }

  /**
   * Full RAG pipeline: route -> retrieve -> rerank -> cite
   */
  async process(query: string): Promise<{
    context: RAGContext;
    contextString: string;
    citations: Citation[];
  }> {
    await this.initialize();

    // Step 1: Route query to relevant categories
    const { categories } = await router.route(query);
    let namespaces = categories.map(c => c.namespace);
    let categoryNames = categories.map(c => c.category);

    // If router confidence is very low (< 0.15 for top category), search ALL content namespaces
    // This prevents misrouting short/ambiguous queries
    const topScore = categories.length > 0 ? categories[0].score : 0;
    if (topScore < 0.15) {
      console.log(`[RAG] Low router confidence (${topScore.toFixed(3)}), searching all namespaces`);
      namespaces = [
        CONFIG.NS.CHEMISTRY, CONFIG.NS.SAFETY,
        CONFIG.NS.TECHNIQUE, CONFIG.NS.NUTRITION,
      ];
      categoryNames = ['chemistry', 'safety', 'technique', 'nutrition'];
    }

    // Step 2: Retrieve from selected namespaces
    const rawChunks = await retriever.retrieve(query, namespaces);

    // Step 3: Rerank and detect conflicts
    const { chunks: rerankedChunks, conflict_detected, conflicting_topics } = await reranker.rerank(query, rawChunks);

    // Step 3.5: RELEVANCE GATE — verify chunks actually relate to the query
    // Hash embeddings give similar scores for relevant and irrelevant content,
    // so we add a keyword overlap check as a secondary relevance signal.
    const queryWords = new Set(
      query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
        .filter(w => w.length > 2 && !['the','and','for','how','does','what','why','can','you','this','that','with','from','are','was','will','about','when','where','which'].includes(w))
    );

    const chunks = rerankedChunks.filter(c => {
      // Check if chunk text shares meaningful keywords with query
      const chunkText = c.chunk.text.toLowerCase();
      const chunkTitle = c.chunk.metadata.title.toLowerCase();
      const combined = chunkText + ' ' + chunkTitle;
      const matchingWords = [...queryWords].filter(w => combined.includes(w));
      const keywordOverlap = queryWords.size > 0 ? matchingWords.length / queryWords.size : 0;

      // Pass if: good embedding score OR significant keyword overlap
      return c.score >= 0.45 || keywordOverlap >= 0.3;
    });

    if (chunks.length === 0 && rerankedChunks.length > 0) {
      console.log(`[RAG] All ${rerankedChunks.length} chunks failed relevance gate. Query words: [${[...queryWords].join(',')}]`);
    }

    // Step 4: Generate citations
    const citations = citationManager.generateCitations(chunks);
    const contextString = citationManager.buildContextString(chunks, citations);

    const context: RAGContext = {
      query,
      retrieved_chunks: chunks,
      categories_searched: categoryNames,
      conflict_detected,
      conflicting_topics,
    };

    console.log(`[RAG] Processed: ${chunks.length} chunks, ${citations.length} citations, conflict=${conflict_detected}`);

    return { context, contextString, citations };
  }
}

export const ragEngine = new RAGEngine();
