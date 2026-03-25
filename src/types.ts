// ─── Document & Chunk Types ─────────────────────────────────────────
export interface DocumentChunk {
  id: string;
  text: string;
  metadata: ChunkMetadata;
  embedding?: number[];
}

export interface ChunkMetadata {
  source_url: string;
  source_type: 'usda' | 'fda' | 'paper' | 'lecture';
  category: 'chemistry' | 'safety' | 'technique' | 'nutrition';
  title: string;
  author: string;
  date: string;
  chunk_index: number;
  total_chunks: number;
}

// ─── RAG Types ──────────────────────────────────────────────────────
export interface RetrievedChunk {
  chunk: DocumentChunk;
  score: number;
  namespace: string;
}

export interface Citation {
  index: number;           // [1], [2], etc.
  title: string;
  author: string;
  source_url: string;
  source_type: string;
  date: string;
}

export interface RAGContext {
  query: string;
  retrieved_chunks: RetrievedChunk[];
  categories_searched: string[];
  conflict_detected: boolean;
  conflicting_topics: string[];
}

// ─── Safety Types ───────────────────────────────────────────────────
export interface SafetyScore {
  overall: number;             // 0.0 - 1.0
  pattern_match: number;       // 0.0 - 1.0 (1 = no dangerous pattern match)
  source_authority: number;    // 0.0 - 1.0
  consistency: number;         // 0.0 - 1.0
  hedging: number;             // 0.0 - 1.0
  flags: SafetyFlag[];
}

export interface SafetyFlag {
  severity: 'info' | 'warning' | 'critical';
  category: string;
  message: string;
}

// ─── Agent Types ────────────────────────────────────────────────────
export interface ChefResponse {
  answer: string;
  citations: Citation[];
  raw_chunks: RetrievedChunk[];
}

export interface SafetyReviewResult {
  safe: boolean;
  score: SafetyScore;
  flags: SafetyFlag[];
  veto: boolean;
  veto_reason?: string;
}

export interface CitationVerifyResult {
  valid_citations: number[];
  invalid_citations: number[];
  warnings: string[];
}

// ─── API Types ──────────────────────────────────────────────────────
export interface AskRequest {
  question: string;
}

export interface AskResponse {
  query_id: string;
  answer: string;
  citations: Citation[];
  safety_score: number;
  safety_flags: SafetyFlag[];
  conflict_detected: boolean;
  categories_searched: string[];
  response_time_ms: number;
}

// ─── Monitoring Types ───────────────────────────────────────────────
export interface QueryMetric {
  timestamp: string;
  query: string;
  categories_routed: string[];
  chunks_retrieved: number;
  safety_score: number;
  safety_flags: string[];
  citation_count: number;
  invalid_citations: number;
  conflict_detected: boolean;
  response_time_ms: number;
}

export interface DashboardData {
  avg_safety_score: number;
  total_queries: number;
  category_distribution: Record<string, number>;
  recent_flags: QueryMetric[];
  top_conflicting_ingredients: { ingredient: string; count: number }[];
  response_time_p50: number;
  response_time_p95: number;
}
