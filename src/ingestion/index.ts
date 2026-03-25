import { CONFIG } from '../config.js';
import type { DocumentChunk } from '../types.js';
import { embedder } from './embedder.js';
import { knowledgeStore } from './loader.js';
import { fetchUSDAFoods, getTopIngredients } from './sources/usda.js';
import { fetchFDASafetyPages } from './sources/fda.js';
import { fetchFoodSciencePapers } from './sources/open-access.js';
import { getLectureContent } from './sources/lectures.js';

// ─── Types ─────────────────────────────────────────────────────────

export type ProgressPhase = 'usda' | 'fda' | 'papers' | 'lectures' | 'embedding' | 'storing';

export interface ProgressEvent {
  phase: ProgressPhase;
  message: string;
  current?: number;
  total?: number;
}

export type ProgressCallback = (event: ProgressEvent) => void;

export interface IngestionResult {
  stats: Record<string, number>;
  totalChunks: number;
  errors: string[];
  durationMs: number;
}

// ─── Namespace mapping ─────────────────────────────────────────────

/** Map source category to the appropriate memory namespace. */
function categoryToNamespace(category: string): string {
  return CONFIG.CATEGORY_TO_NAMESPACE[category] || CONFIG.NS.CHEMISTRY;
}

// ─── Pipeline ──────────────────────────────────────────────────────

/**
 * Run the full data ingestion pipeline:
 *  1. Fetch chunks from all 4 sources (USDA, FDA, Semantic Scholar, lectures)
 *  2. Embed each chunk
 *  3. Store in the knowledge store under the appropriate namespace
 *
 * @param onProgress - Optional callback for progress reporting
 */
export async function runFullIngestion(
  onProgress?: ProgressCallback,
): Promise<IngestionResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const allChunks: DocumentChunk[] = [];

  const report = (phase: ProgressPhase, message: string, current?: number, total?: number) => {
    console.log(`[Ingestion][${phase}] ${message}`);
    onProgress?.({ phase, message, current, total });
  };

  // ── Phase 1: Fetch from all sources ──────────────────────────────

  // 1a. USDA (skip if DEMO_KEY to avoid rate limits, retry when user provides real key)
  if (CONFIG.USDA_API_KEY && CONFIG.USDA_API_KEY !== 'DEMO_KEY') {
    report('usda', 'Fetching USDA nutrition data...');
    try {
      const ingredients = getTopIngredients();
      report('usda', `Querying ${ingredients.length} ingredients...`);

      for (let i = 0; i < ingredients.length; i++) {
        try {
          const chunks = await fetchUSDAFoods(CONFIG.USDA_API_KEY, ingredients[i], 3);
          allChunks.push(...chunks);
          report('usda', `Fetched "${ingredients[i]}" (${chunks.length} chunks)`, i + 1, ingredients.length);
        } catch (err) {
          const msg = `USDA fetch failed for "${ingredients[i]}": ${err instanceof Error ? err.message : err}`;
          errors.push(msg);
          console.warn(`[Ingestion] ${msg}`);
        }
      }
      report('usda', `USDA complete: ${allChunks.length} chunks`);
    } catch (err) {
      const msg = `USDA source failed: ${err instanceof Error ? err.message : err}`;
      errors.push(msg);
      report('usda', msg);
    }
  } else {
    report('usda', 'Skipping USDA (DEMO_KEY detected — set a real USDA_API_KEY in .env for nutrition data)');
  }

  // 1b. FDA safety pages
  report('fda', 'Fetching FDA safety pages...');
  try {
    const fdaChunks = await fetchFDASafetyPages();
    allChunks.push(...fdaChunks);
    report('fda', `FDA complete: ${fdaChunks.length} chunks`);
  } catch (err) {
    const msg = `FDA source failed: ${err instanceof Error ? err.message : err}`;
    errors.push(msg);
    report('fda', msg);
  }

  // 1c. Semantic Scholar papers
  report('papers', 'Fetching food science papers...');
  try {
    const paperChunks = await fetchFoodSciencePapers();
    allChunks.push(...paperChunks);
    report('papers', `Papers complete: ${paperChunks.length} chunks`);
  } catch (err) {
    const msg = `Papers source failed: ${err instanceof Error ? err.message : err}`;
    errors.push(msg);
    report('papers', msg);
  }

  // 1d. Curated lectures
  report('lectures', 'Loading curated lecture content...');
  try {
    const lectureChunks = getLectureContent();
    allChunks.push(...lectureChunks);
    report('lectures', `Lectures complete: ${lectureChunks.length} chunks`);
  } catch (err) {
    const msg = `Lectures source failed: ${err instanceof Error ? err.message : err}`;
    errors.push(msg);
    report('lectures', msg);
  }

  // ── Phase 2: Embed all chunks ────────────────────────────────────

  report('embedding', `Embedding ${allChunks.length} chunks...`);
  for (let i = 0; i < allChunks.length; i++) {
    try {
      allChunks[i].embedding = await embedder.embed(allChunks[i].text);
    } catch (err) {
      const msg = `Embedding failed for chunk ${allChunks[i].id}: ${err instanceof Error ? err.message : err}`;
      errors.push(msg);
    }

    if ((i + 1) % 50 === 0 || i === allChunks.length - 1) {
      report('embedding', `Embedded ${i + 1}/${allChunks.length}`, i + 1, allChunks.length);
    }
  }

  // ── Phase 3: Store in knowledge store ────────────────────────────

  report('storing', `Storing ${allChunks.length} chunks...`);
  const namespaceCounts: Record<string, number> = {};

  for (let i = 0; i < allChunks.length; i++) {
    const chunk = allChunks[i];
    if (!chunk.embedding) continue;

    const namespace = categoryToNamespace(chunk.metadata.category);
    const tags = [
      chunk.metadata.source_type,
      chunk.metadata.category,
      chunk.metadata.title,
    ];

    try {
      await knowledgeStore.store(
        namespace,
        chunk.id,
        JSON.stringify({ text: chunk.text, metadata: chunk.metadata }),
        tags,
        chunk.embedding,
      );

      namespaceCounts[namespace] = (namespaceCounts[namespace] || 0) + 1;
    } catch (err) {
      const msg = `Store failed for chunk ${chunk.id}: ${err instanceof Error ? err.message : err}`;
      errors.push(msg);
    }

    if ((i + 1) % 50 === 0 || i === allChunks.length - 1) {
      report('storing', `Stored ${i + 1}/${allChunks.length}`, i + 1, allChunks.length);
    }
  }

  // Get actual counts from the store (more reliable than counting during insert)
  const actualStats = knowledgeStore.getStats();
  const finalStats = { ...namespaceCounts, ...actualStats.namespaces };

  const durationMs = Date.now() - startTime;
  const result: IngestionResult = {
    stats: finalStats,
    totalChunks: Object.values(finalStats).reduce((a, b) => a + b, 0),
    errors,
    durationMs,
  };

  console.log(`[Ingestion] Complete in ${(durationMs / 1000).toFixed(1)}s`);
  console.log(`[Ingestion] Stats:`, JSON.stringify(namespaceCounts, null, 2));
  if (errors.length > 0) {
    console.warn(`[Ingestion] ${errors.length} errors encountered`);
  }

  return result;
}

// ─── Re-exports for convenience ────────────────────────────────────

export { embedder } from './embedder.js';
export { knowledgeStore } from './loader.js';
export { chunkDocument } from './chunker.js';
export { fetchUSDAFoods, getTopIngredients } from './sources/usda.js';
export { fetchFDASafetyPages } from './sources/fda.js';
export { fetchFoodSciencePapers } from './sources/open-access.js';
export { getLectureContent } from './sources/lectures.js';
