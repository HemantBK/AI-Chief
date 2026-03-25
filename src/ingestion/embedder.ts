import { CONFIG } from '../config.js';

const DIMENSIONS = CONFIG.EMBEDDING_DIMENSIONS; // 384

/**
 * Simple deterministic hash for a single word.
 * Produces a 32-bit integer using a FNV-1a-like algorithm.
 */
function hashWord(word: string): number {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < word.length; i++) {
    h ^= word.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV prime
  }
  return h >>> 0; // unsigned
}

/**
 * L2-normalize a vector in place and return it.
 */
function l2Normalize(vec: number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) {
    sumSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sumSq);
  if (norm === 0) return vec;
  for (let i = 0; i < vec.length; i++) {
    vec[i] /= norm;
  }
  return vec;
}

/**
 * Compute cosine similarity between two vectors of equal length.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * Enhanced local embedding generator.
 *
 * Produces deterministic 384-dimensional embeddings with TF-IDF-like weighting.
 * Content words (nouns, domain terms) get higher weight than stopwords.
 * Uses multi-hash scattering + bigram context for better semantic signal.
 */
export class Embedder {
  private cache: Map<string, number[]> = new Map();

  // Common stopwords get reduced weight
  private static STOPWORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
    'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
    'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
    'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
    'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    'just', 'because', 'but', 'and', 'or', 'if', 'while', 'about', 'that',
    'this', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we',
    'our', 'you', 'your', 'he', 'she', 'his', 'her', 'what', 'which', 'who',
    'whom', 'also', 'been', 'much', 'many', 'any', 'well', 'back',
  ]);

  // Food science domain terms get boosted weight
  private static DOMAIN_BOOST = new Set([
    'temperature', 'bacteria', 'protein', 'starch', 'enzyme', 'reaction',
    'maillard', 'caramelization', 'denaturation', 'emulsion', 'gluten',
    'fermentation', 'retrogradation', 'gelatinization', 'oxidation', 'ph',
    'acid', 'alkaline', 'collagen', 'gelatin', 'pectin', 'cellulose',
    'salmonella', 'botulism', 'pasteurization', 'smoke', 'browning',
    'crystallization', 'freezing', 'thawing', 'brining', 'curing',
    'leavening', 'yeast', 'lactose', 'casein', 'ovalbumin', 'lecithin',
    'amylose', 'amylopectin', 'saturated', 'unsaturated', 'monounsaturated',
    'polyunsaturated', 'acrylamide', 'vitamin', 'mineral', 'nutrient',
    'calorie', 'carbohydrate', 'fiber', 'cholesterol', 'sodium',
    'allergen', 'allergy', 'gluten', 'celiac', 'intolerance',
    'safe', 'unsafe', 'danger', 'hazard', 'contamination', 'pathogen',
    'cooking', 'baking', 'frying', 'roasting', 'boiling', 'steaming',
    'grilling', 'sous', 'vide', 'blanching', 'searing',
    'bread', 'flour', 'sugar', 'butter', 'oil', 'egg', 'milk', 'cream',
    'meat', 'chicken', 'beef', 'pork', 'fish', 'rice', 'pasta', 'onion',
    'garlic', 'salt', 'pepper', 'vinegar', 'chocolate', 'cheese', 'yogurt',
    'substitute', 'substitution', 'replacement', 'alternative',
  ]);

  /**
   * Generate a 384-dim embedding for the given text.
   * Results are cached by exact text match.
   */
  async embed(text: string): Promise<number[]> {
    const cached = this.cache.get(text);
    if (cached) return cached;

    const vec = new Array<number>(DIMENSIONS).fill(0);
    const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);

    for (let wi = 0; wi < words.length; wi++) {
      const word = words[wi];
      if (word.length < 2) continue;

      const h = hashWord(word);

      // Compute weight: stopwords=0.1, domain terms=3.0, normal words=1.0
      let weight = 1.0;
      if (Embedder.STOPWORDS.has(word)) {
        weight = 0.1;
      } else if (Embedder.DOMAIN_BOOST.has(word)) {
        weight = 3.0;
      } else if (word.length >= 6) {
        weight = 1.5; // Longer words tend to be more meaningful
      }

      // Scatter contributions across multiple dimensions per word
      for (let k = 0; k < 5; k++) {
        const rotated = ((h << (k * 5)) | (h >>> (32 - k * 5))) >>> 0;
        const idx = rotated % DIMENSIONS;
        const sign = (rotated & (1 << (k + 12))) ? 1 : -1;
        const magnitude = weight * (1.0 + (((h >>> (k * 3)) & 0x0f) / 30));
        vec[idx] += sign * magnitude;
      }

      // Bigram context (stronger signal)
      if (wi > 0) {
        const bigramHash = hashWord(words[wi - 1] + '_' + word);
        for (let k = 0; k < 2; k++) {
          const biIdx = (((bigramHash << (k * 11)) | (bigramHash >>> (32 - k * 11))) >>> 0) % DIMENSIONS;
          const biSign = (bigramHash & (1 << (k + 7))) ? 1 : -1;
          vec[biIdx % DIMENSIONS] += biSign * weight * 0.7;
        }
      }

      // Trigram context for even richer signal
      if (wi > 1) {
        const trigramHash = hashWord(words[wi - 2] + '_' + words[wi - 1] + '_' + word);
        const triIdx = trigramHash % DIMENSIONS;
        const triSign = (trigramHash & (1 << 15)) ? 1 : -1;
        vec[triIdx] += triSign * weight * 0.4;
      }
    }

    l2Normalize(vec);
    this.cache.set(text, vec);
    return vec;
  }

  /**
   * Compute cosine similarity between embeddings of two texts.
   */
  async compare(text1: string, text2: string): Promise<number> {
    const [emb1, emb2] = await Promise.all([this.embed(text1), this.embed(text2)]);
    return cosineSimilarity(emb1, emb2);
  }

  /**
   * Clear the embedding cache (useful for memory management in long runs).
   */
  clearCache(): void {
    this.cache.clear();
  }

  /** Number of cached embeddings. */
  get cacheSize(): number {
    return this.cache.size;
  }
}

/** Singleton embedder instance for use across the application. */
export const embedder = new Embedder();

/** Re-export the cosine similarity utility for use in other modules. */
export { cosineSimilarity };
