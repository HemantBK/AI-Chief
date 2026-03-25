/**
 * Citation Extraction & Formatting
 * Tracks which sources were used and formats inline citations.
 */

import { RetrievedChunk, Citation } from '../types.js';

class CitationManager {
  /**
   * Generate citations from retrieved chunks used in a response
   */
  generateCitations(chunks: RetrievedChunk[]): Citation[] {
    const seen = new Set<string>();
    const citations: Citation[] = [];

    for (const chunk of chunks) {
      // Deduplicate by source URL or title
      const key = chunk.chunk.metadata.source_url || chunk.chunk.metadata.title;
      if (seen.has(key)) continue;
      seen.add(key);

      citations.push({
        index: citations.length + 1,
        title: chunk.chunk.metadata.title,
        author: chunk.chunk.metadata.author,
        source_url: chunk.chunk.metadata.source_url,
        source_type: chunk.chunk.metadata.source_type,
        date: chunk.chunk.metadata.date,
      });
    }

    return citations;
  }

  /**
   * Format citations as a readable "Sources" section
   */
  formatSourcesSection(citations: Citation[]): string {
    if (citations.length === 0) return '';

    const lines = citations.map(c => {
      const parts = [`[${c.index}]`];
      if (c.title) parts.push(c.title);
      if (c.author) parts.push(`by ${c.author}`);
      if (c.date) parts.push(`(${c.date})`);
      if (c.source_url) parts.push(`- ${c.source_url}`);
      parts.push(`[${c.source_type.toUpperCase()}]`);
      return parts.join(' ');
    });

    return '\n\n---\n**Sources:**\n' + lines.join('\n');
  }

  /**
   * Build the context string for the LLM prompt from retrieved chunks
   */
  buildContextString(chunks: RetrievedChunk[], citations: Citation[]): string {
    const contextParts: string[] = [];

    // Map chunk source to citation index
    const sourceToIndex = new Map<string, number>();
    for (const c of citations) {
      sourceToIndex.set(c.source_url || c.title, c.index);
    }

    for (const chunk of chunks) {
      const key = chunk.chunk.metadata.source_url || chunk.chunk.metadata.title;
      const idx = sourceToIndex.get(key) || '?';
      contextParts.push(
        `[Source ${idx}: ${chunk.chunk.metadata.title} (${chunk.chunk.metadata.source_type.toUpperCase()})]:\n${chunk.chunk.text}`
      );
    }

    return contextParts.join('\n\n---\n\n');
  }
}

export const citationManager = new CitationManager();
