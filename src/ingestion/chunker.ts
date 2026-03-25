import { v4 as uuidv4 } from 'uuid';
import { CONFIG } from '../config.js';
import type { DocumentChunk, ChunkMetadata } from '../types.js';

/**
 * Estimate token count from text.
 * Rough heuristic: 1 word ~ 1.3 tokens on average.
 */
function estimateTokens(text: string): number {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(wordCount * 1.3);
}

/**
 * Extract approximately `tokenCount` tokens worth of text from the end of a string.
 * Used to create overlap between consecutive chunks.
 */
function extractOverlapText(text: string, tokenCount: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  // Convert token target back to approximate word count
  const wordTarget = Math.ceil(tokenCount / 1.3);
  if (words.length <= wordTarget) return text;
  return words.slice(-wordTarget).join(' ');
}

/**
 * Split raw text into paragraphs, filtering out empty ones.
 */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Chunk a document into overlapping pieces targeting CONFIG.CHUNK_SIZE_TOKENS tokens.
 *
 * Strategy:
 *  1. Split text into paragraphs.
 *  2. Greedily merge consecutive paragraphs into chunks until the token target is reached.
 *  3. Add CONFIG.CHUNK_OVERLAP_TOKENS tokens of overlap from the previous chunk to the next.
 */
export function chunkDocument(
  text: string,
  metadata: Omit<ChunkMetadata, 'chunk_index' | 'total_chunks'>,
): DocumentChunk[] {
  const targetTokens = CONFIG.CHUNK_SIZE_TOKENS;
  const overlapTokens = CONFIG.CHUNK_OVERLAP_TOKENS;

  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) return [];

  // --- Phase 1: Build raw chunks by merging paragraphs ---
  const rawChunks: string[] = [];
  let currentParts: string[] = [];
  let currentTokens = 0;

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);

    // If a single paragraph exceeds the target, flush current and add it alone
    if (paraTokens > targetTokens && currentParts.length > 0) {
      rawChunks.push(currentParts.join('\n\n'));
      currentParts = [];
      currentTokens = 0;
    }

    if (currentTokens + paraTokens > targetTokens && currentParts.length > 0) {
      rawChunks.push(currentParts.join('\n\n'));
      currentParts = [];
      currentTokens = 0;
    }

    currentParts.push(para);
    currentTokens += paraTokens;
  }

  // Flush remaining
  if (currentParts.length > 0) {
    rawChunks.push(currentParts.join('\n\n'));
  }

  // --- Phase 2: Apply overlap ---
  const overlappedChunks: string[] = [];
  for (let i = 0; i < rawChunks.length; i++) {
    if (i === 0) {
      overlappedChunks.push(rawChunks[i]);
    } else {
      const overlap = extractOverlapText(rawChunks[i - 1], overlapTokens);
      overlappedChunks.push(overlap + '\n\n' + rawChunks[i]);
    }
  }

  // --- Phase 3: Build DocumentChunk objects ---
  const totalChunks = overlappedChunks.length;
  return overlappedChunks.map((chunkText, index) => ({
    id: uuidv4(),
    text: chunkText,
    metadata: {
      ...metadata,
      chunk_index: index,
      total_chunks: totalChunks,
    },
  }));
}
