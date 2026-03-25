import 'dotenv/config';

export const CONFIG = {
  // API Keys
  USDA_API_KEY: process.env.USDA_API_KEY || 'DEMO_KEY',

  // Embedding
  EMBEDDING_MODEL: 'all-MiniLM-L6-v2' as const,
  EMBEDDING_DIMENSIONS: 384,

  // Chunking
  CHUNK_SIZE_TOKENS: 400,
  CHUNK_OVERLAP_TOKENS: 50,

  // RAG
  RETRIEVAL_TOP_K: 5,
  ROUTER_TOP_CATEGORIES: 2,
  RERANK_THRESHOLD: 0.3,

  // Safety
  SAFETY_SCORE_THRESHOLD: 0.6,    // Below this = flagged
  SAFETY_VETO_THRESHOLD: 0.3,     // Below this = blocked & re-prompted
  DANGEROUS_PATTERN_THRESHOLD: 0.7,

  // HNSW Router
  HNSW_MAX_PATTERNS: 11,          // ruvllm v2.0.1 limit
  HNSW_EF_SEARCH: 50,

  // Server
  PORT: parseInt(process.env.PORT || '3000'),
  HOST: process.env.HOST || '0.0.0.0',

  // Memory Namespaces
  NS: {
    CHEMISTRY: 'food-chemistry',
    SAFETY: 'food-safety',
    TECHNIQUE: 'cooking-technique',
    NUTRITION: 'nutrition-data',
    SAFETY_PATTERNS: 'safety-patterns',
    QUERY_LOG: 'query-log',
    METRICS: 'metrics',
  },

  // Source authority scores (for safety confidence)
  SOURCE_AUTHORITY: {
    usda: 1.0,
    fda: 1.0,
    paper: 0.9,
    lecture: 0.7,
    unknown: 0.3,
  } as Record<string, number>,

  // Category anchor texts for HNSW routing
  CATEGORY_ANCHORS: {
    chemistry: 'chemical reactions in cooking molecular changes pH proteins enzymes Maillard browning caramelization emulsification starch gelatinization denaturation fermentation oxidation',
    safety: 'food safety temperature danger zone bacteria contamination pathogen cooking temperature cross contamination storage shelf life foodborne illness allergen',
    technique: 'cooking method technique substitution equipment baking roasting frying steaming blanching braising sauteing ingredient replacement ratio conversion',
    nutrition: 'nutrient content calories protein fat carbohydrate vitamins minerals fiber sodium sugar dietary nutritional value macronutrient micronutrient',
  },

  // Map category anchor -> namespace
  CATEGORY_TO_NAMESPACE: {
    chemistry: 'food-chemistry',
    safety: 'food-safety',
    technique: 'cooking-technique',
    nutrition: 'nutrition-data',
  } as Record<string, string>,

  // USDA safe minimum temperatures (Fahrenheit)
  SAFE_TEMPS: {
    'poultry': 165,
    'ground meat': 160,
    'beef steak': 145,
    'pork': 145,
    'fish': 145,
    'leftovers': 165,
    'casseroles': 165,
    'eggs': 160,
    'ham fresh': 145,
    'ham reheating': 165,
  } as Record<string, number>,
} as const;

export type SourceType = 'usda' | 'fda' | 'paper' | 'lecture';
export type CategoryType = 'chemistry' | 'safety' | 'technique' | 'nutrition';
export type Namespace = typeof CONFIG.NS[keyof typeof CONFIG.NS];
