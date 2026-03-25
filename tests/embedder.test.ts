/**
 * Tests for the Embedder module
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Embedder } from '../src/ingestion/embedder.js';

describe('Embedder', () => {
  let embedder: Embedder;

  beforeEach(() => {
    embedder = new Embedder();
  });

  it('generates 384-dimensional embeddings', async () => {
    const emb = await embedder.embed('bread staling starch');
    expect(emb).toHaveLength(384);
  });

  it('generates normalized vectors (L2 norm ≈ 1)', async () => {
    const emb = await embedder.embed('maillard reaction browning');
    const norm = Math.sqrt(emb.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 4);
  });

  it('produces deterministic embeddings (same input = same output)', async () => {
    const emb1 = await embedder.embed('egg protein denaturation');
    const emb2 = await embedder.embed('egg protein denaturation');
    expect(emb1).toEqual(emb2);
  });

  it('produces different embeddings for different inputs', async () => {
    const emb1 = await embedder.embed('bread staling');
    const emb2 = await embedder.embed('chocolate tempering');
    expect(emb1).not.toEqual(emb2);
  });

  it('gives higher similarity for related texts', async () => {
    const sim1 = await embedder.compare('bread staling starch', 'bread goes stale retrogradation');
    const sim2 = await embedder.compare('bread staling starch', 'stock market trading');
    expect(sim1).toBeGreaterThan(sim2);
  });

  it('gives high similarity for near-identical texts', async () => {
    const sim = await embedder.compare(
      'the Maillard reaction creates browning in food',
      'Maillard reaction causes food to brown'
    );
    expect(sim).toBeGreaterThan(0.3);
  });

  it('domain-boosted terms have more influence', async () => {
    // "temperature bacteria safe" should be more similar to safety content
    // than generic words
    const simDomain = await embedder.compare(
      'temperature bacteria salmonella',
      'food safety cooking temperature bacteria danger'
    );
    const simGeneric = await embedder.compare(
      'the big house over there',
      'food safety cooking temperature bacteria danger'
    );
    expect(simDomain).toBeGreaterThan(simGeneric);
  });

  it('caches embeddings for performance', async () => {
    await embedder.embed('test caching');
    expect(embedder.cacheSize).toBe(1);
    await embedder.embed('test caching');
    expect(embedder.cacheSize).toBe(1); // Should not increase
    await embedder.embed('different text');
    expect(embedder.cacheSize).toBe(2);
  });

  it('clears cache correctly', async () => {
    await embedder.embed('some text');
    expect(embedder.cacheSize).toBe(1);
    embedder.clearCache();
    expect(embedder.cacheSize).toBe(0);
  });

  it('handles empty string without crashing', async () => {
    const emb = await embedder.embed('');
    expect(emb).toHaveLength(384);
  });

  it('handles very long text without crashing', async () => {
    const longText = 'food science cooking chemistry '.repeat(500);
    const emb = await embedder.embed(longText);
    expect(emb).toHaveLength(384);
    const norm = Math.sqrt(emb.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 4);
  });
});
