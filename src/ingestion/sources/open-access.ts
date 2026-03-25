import { chunkDocument } from '../chunker.js';
import type { DocumentChunk } from '../../types.js';

// ─── Semantic Scholar API types ────────────────────────────────────
interface S2Author {
  name: string;
}

interface S2Paper {
  paperId: string;
  title: string;
  abstract: string | null;
  authors: S2Author[];
  year: number | null;
  isOpenAccess: boolean;
  url: string;
}

interface S2SearchResponse {
  total: number;
  data: S2Paper[];
}

/** Default food science research queries. */
const DEFAULT_QUERIES = [
  'Maillard reaction food',
  'starch retrogradation bread',
  'emulsification cooking',
  'food fermentation chemistry',
  'thermal denaturation protein cooking',
  'caramelization sugar chemistry',
];

/**
 * Fetch open-access food science paper abstracts from Semantic Scholar
 * and return them as chunked documents.
 *
 * @param queries - Search queries (defaults to curated food science topics)
 */
export async function fetchFoodSciencePapers(
  queries: string[] = DEFAULT_QUERIES,
): Promise<DocumentChunk[]> {
  const allChunks: DocumentChunk[] = [];
  const seenPaperIds = new Set<string>();

  for (const query of queries) {
    try {
      const url = new URL('https://api.semanticscholar.org/graph/v1/paper/search');
      url.searchParams.set('query', query);
      url.searchParams.set('limit', '5');
      url.searchParams.set('fields', 'title,abstract,authors,year,isOpenAccess,url');

      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        console.warn(`[Papers] Semantic Scholar error ${response.status} for query "${query}"`);
        // Respect rate limits: back off on 429
        if (response.status === 429) {
          console.warn('[Papers] Rate limited, waiting 5s...');
          await sleep(5000);
        }
        continue;
      }

      const data = (await response.json()) as S2SearchResponse;

      if (!data.data || data.data.length === 0) {
        console.warn(`[Papers] No results for query "${query}"`);
        continue;
      }

      // Filter to open-access papers with abstracts, deduplicate
      const papers = data.data.filter(
        (p) => p.isOpenAccess && p.abstract && p.abstract.length > 50 && !seenPaperIds.has(p.paperId),
      );

      for (const paper of papers) {
        seenPaperIds.add(paper.paperId);

        const authorStr = paper.authors.map((a) => a.name).join(', ') || 'Unknown';
        const yearStr = paper.year ? String(paper.year) : 'Unknown';

        const text = [
          `Title: ${paper.title}`,
          `Authors: ${authorStr}`,
          `Year: ${yearStr}`,
          '',
          'Abstract:',
          paper.abstract,
        ].join('\n');

        const chunks = chunkDocument(text, {
          source_url: paper.url || `https://api.semanticscholar.org/paper/${paper.paperId}`,
          source_type: 'paper',
          category: 'chemistry',
          title: paper.title,
          author: authorStr,
          date: yearStr,
        });

        allChunks.push(...chunks);
      }

      console.log(`[Papers] Query "${query}": ${papers.length} open-access papers`);

      // Be polite to the API
      await sleep(1000);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[Papers] Failed query "${query}": ${message}`);
    }
  }

  console.log(`[Papers] Total chunks: ${allChunks.length} from ${seenPaperIds.size} papers`);
  return allChunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
