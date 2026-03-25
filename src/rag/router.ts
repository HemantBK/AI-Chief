/**
 * Semantic Category Router
 * Uses local embeddings to route queries to the most relevant knowledge namespaces.
 * At startup, creates anchor embeddings for each category.
 * At query time, finds the top-K most similar categories.
 */

import { CONFIG, CategoryType } from '../config.js';
import { embedder } from '../ingestion/embedder.js';

interface CategoryAnchor {
  category: CategoryType;
  namespace: string;
  embedding: number[];
}

class SemanticRouter {
  private anchors: CategoryAnchor[] = [];
  private initialized = false;
  private hnswRouterId: string | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[Router] Initializing category anchors...');

    for (const [category, anchorText] of Object.entries(CONFIG.CATEGORY_ANCHORS)) {
      const embedding = await embedder.embed(anchorText);
      this.anchors.push({
        category: category as CategoryType,
        namespace: CONFIG.CATEGORY_TO_NAMESPACE[category],
        embedding,
      });
    }

    this.initialized = true;
    console.log(`[Router] Initialized ${this.anchors.length} category anchors`);
  }

  /**
   * Route a query to the most relevant category namespaces.
   * Also applies keyword-based overrides for clear safety/chemistry queries.
   */
  async route(query: string, topK: number = CONFIG.ROUTER_TOP_CATEGORIES): Promise<{
    categories: { category: CategoryType; namespace: string; score: number }[];
  }> {
    if (!this.initialized) {
      await this.initialize();
    }

    const queryEmbedding = await embedder.embed(query);
    const queryLower = query.toLowerCase();

    // Compute cosine similarity with each anchor
    const scored = this.anchors.map(anchor => ({
      category: anchor.category,
      namespace: anchor.namespace,
      score: cosineSimilarity(queryEmbedding, anchor.embedding),
    }));

    // Keyword-based boosting for clear category signals
    const safetyKeywords = ['safe', 'danger', 'raw', 'temperature', 'bacteria', 'poison', 'toxic',
      'expire', 'spoil', 'contamina', 'foodborne', 'illness', 'salmonella', 'cook temp',
      'refreeze', 'thaw', 'room temperature', 'leave out', 'overnight', 'undercooked'];
    const chemistryKeywords = ['why does', 'why do', 'reaction', 'molecule', 'chemical', 'protein',
      'starch', 'maillard', 'carameliz', 'denatur', 'emulsif', 'ferment', 'enzyme',
      'retrogradation', 'gelatiniz', 'oxidat', 'ph ', 'acid', 'alkaline',
      'onion', 'cry', 'tear', 'brown', 'color', 'change', 'science behind',
      'chocolate', 'temper', 'crystal', 'meat color', 'myoglobin', 'coffee'];
    const techniqueKeywords = ['substitute', 'replace', 'instead of', 'swap', 'how to',
      'method', 'technique', 'sous vide', 'baking', 'frying', 'roasting', 'smoke point'];
    const nutritionKeywords = ['calories', 'protein content', 'nutrition', 'vitamin',
      'mineral', 'fiber', 'fat content', 'carb', 'sodium', 'sugar content'];

    for (const item of scored) {
      if (item.category === 'safety' && safetyKeywords.some(k => queryLower.includes(k))) {
        item.score += 0.3;
      }
      if (item.category === 'chemistry' && chemistryKeywords.some(k => queryLower.includes(k))) {
        item.score += 0.3;
      }
      if (item.category === 'technique' && techniqueKeywords.some(k => queryLower.includes(k))) {
        item.score += 0.3;
      }
      if (item.category === 'nutrition' && nutritionKeywords.some(k => queryLower.includes(k))) {
        item.score += 0.3;
      }
    }

    // Normalize scores to [0, 1] range
    const maxScore = Math.max(...scored.map(s => s.score), 0.001);
    if (maxScore > 1.0) {
      for (const item of scored) {
        item.score = item.score / maxScore;
      }
    }

    // Sort by score descending, take top-K
    scored.sort((a, b) => b.score - a.score);
    const topCategories = scored.slice(0, topK);

    console.log(`[Router] Query: "${query.slice(0, 60)}..." -> [${topCategories.map(c => `${c.category}(${c.score.toFixed(3)})`).join(', ')}]`);

    return { categories: topCategories };
  }

  /**
   * Get all available categories
   */
  getCategories(): CategoryType[] {
    return Object.keys(CONFIG.CATEGORY_ANCHORS) as CategoryType[];
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export const router = new SemanticRouter();
export { cosineSimilarity };
