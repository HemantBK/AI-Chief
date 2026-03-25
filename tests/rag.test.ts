/**
 * Tests for the RAG pipeline components
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Embedder } from '../src/ingestion/embedder.js';
import { KnowledgeStore } from '../src/ingestion/loader.js';
import { chunkDocument } from '../src/ingestion/chunker.js';

describe('Chunker', () => {
  it('splits text into chunks of appropriate size', () => {
    const longText = Array(20).fill(
      'The Maillard reaction is a chemical reaction between amino acids and reducing sugars that gives browned food its distinctive flavor.'
    ).join('\n\n');

    const chunks = chunkDocument(longText, {
      source_url: 'test://test',
      source_type: 'lecture',
      category: 'chemistry',
      title: 'Test',
      author: 'Test',
      date: '2024-01-01',
    });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const wordCount = chunk.text.split(/\s+/).length;
      // Each chunk should be under 400 * 1.3 ≈ 520 words (generous)
      expect(wordCount).toBeLessThan(600);
    }
  });

  it('assigns correct metadata to chunks', () => {
    const chunks = chunkDocument('Some food science content here. This is important.', {
      source_url: 'https://example.com',
      source_type: 'fda',
      category: 'safety',
      title: 'FDA Guide',
      author: 'FDA',
      date: '2024-01-01',
    });

    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].metadata.source_type).toBe('fda');
    expect(chunks[0].metadata.category).toBe('safety');
    expect(chunks[0].metadata.title).toBe('FDA Guide');
    expect(chunks[0].id).toBeTruthy();
  });

  it('handles empty text gracefully', () => {
    const chunks = chunkDocument('', {
      source_url: '', source_type: 'lecture', category: 'chemistry',
      title: 'Empty', author: '', date: '',
    });
    // Should return at least one chunk (even if empty) or zero
    expect(chunks.length).toBeLessThanOrEqual(1);
  });
});

describe('KnowledgeStore', () => {
  let store: KnowledgeStore;
  let embedder: Embedder;

  beforeAll(async () => {
    store = new KnowledgeStore();
    embedder = new Embedder();
  });

  it('stores and retrieves by namespace', async () => {
    const emb = await embedder.embed('bread staling retrogradation');
    await store.store('food-chemistry', 'test-1', 'Bread goes stale due to starch retrogradation', ['lecture', 'chemistry'], emb);

    const stats = store.getStats();
    expect(stats.namespaces['food-chemistry']).toBe(1);
  });

  it('searches by cosine similarity', async () => {
    const emb1 = await embedder.embed('bread staling retrogradation starch');
    await store.store('test-ns', 'bread-1', 'Bread staling is caused by starch retrogradation', ['lecture'], emb1);

    const emb2 = await embedder.embed('salmonella bacteria food safety temperature');
    await store.store('test-ns', 'safety-1', 'Salmonella is killed at 165°F internal temperature', ['fda'], emb2);

    // Query about bread should rank bread chunk higher
    const queryEmb = await embedder.embed('why does bread go stale');
    const results = await store.search('test-ns', queryEmb, 5);

    expect(results.length).toBe(2);
    // Bread chunk should score higher than safety chunk
    const breadResult = results.find(r => r.key === 'bread-1');
    const safetyResult = results.find(r => r.key === 'safety-1');
    expect(breadResult).toBeTruthy();
    expect(safetyResult).toBeTruthy();
    if (breadResult && safetyResult) {
      expect(breadResult.score).toBeGreaterThan(safetyResult.score);
    }
  });

  it('respects namespace boundaries', async () => {
    const store2 = new KnowledgeStore();
    const emb = await embedder.embed('test content');
    await store2.store('ns-a', 'item-1', 'Content A', ['tag'], emb);
    await store2.store('ns-b', 'item-2', 'Content B', ['tag'], emb);

    const resultsA = await store2.search('ns-a', emb, 10);
    expect(resultsA.length).toBe(1);
    expect(resultsA[0].key).toBe('item-1');

    const resultsB = await store2.search('ns-b', emb, 10);
    expect(resultsB.length).toBe(1);
    expect(resultsB[0].key).toBe('item-2');
  });

  it('returns empty for non-existent namespace', async () => {
    const store3 = new KnowledgeStore();
    const emb = await embedder.embed('query');
    const results = await store3.search('non-existent', emb, 5);
    expect(results.length).toBe(0);
  });

  it('clearNamespace removes only target namespace', async () => {
    const store4 = new KnowledgeStore();
    const emb = await embedder.embed('test');
    await store4.store('keep-ns', 'k1', 'keep this', ['tag'], emb);
    await store4.store('clear-ns', 'c1', 'clear this', ['tag'], emb);

    store4.clearNamespace('clear-ns');

    expect(store4.hasNamespace('keep-ns')).toBe(true);
    expect(store4.hasNamespace('clear-ns')).toBe(false);
  });

  it('getStats returns accurate counts', async () => {
    const store5 = new KnowledgeStore();
    const emb = await embedder.embed('test');
    await store5.store('ns-1', 'a', 'a', [], emb);
    await store5.store('ns-1', 'b', 'b', [], emb);
    await store5.store('ns-2', 'c', 'c', [], emb);

    const stats = store5.getStats();
    expect(stats.namespaces['ns-1']).toBe(2);
    expect(stats.namespaces['ns-2']).toBe(1);
  });
});
