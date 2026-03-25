import { cosineSimilarity } from './embedder.js';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DB_DIR, 'knowledge.db');

// Ensure the data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Shared singleton DB connection
let _db: InstanceType<typeof Database> | null = null;

function getDb(): InstanceType<typeof Database> {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');

    _db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        namespace TEXT NOT NULL,
        id TEXT NOT NULL,
        value TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        embedding BLOB,
        PRIMARY KEY (namespace, id)
      );
    `);

    _db.exec(`
      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        data TEXT NOT NULL DEFAULT '{}'
      );
    `);

    _db.exec(`
      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query_id TEXT NOT NULL,
        helpful INTEGER NOT NULL DEFAULT 0,
        comment TEXT
      );
    `);
  }
  return _db;
}

// ── Helpers for embedding serialization ──────────────────────────────

function embeddingToBuffer(embedding: number[]): Buffer {
  const float32 = new Float32Array(embedding);
  return Buffer.from(float32.buffer);
}

function bufferToEmbedding(buf: Buffer): number[] {
  const float32 = new Float32Array(
    buf.buffer,
    buf.byteOffset,
    buf.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
  return Array.from(float32);
}

// ── Types ────────────────────────────────────────────────────────────

interface StoreEntry {
  value: string;
  tags: string[];
  embedding: number[];
}

interface SearchResult {
  key: string;
  value: string;
  tags: string[];
  score: number;
}

/**
 * SQLite-backed knowledge store organised by namespace.
 *
 * All embeddings are also cached in memory (`_data`) so that cosine-similarity
 * search remains fast.  SQLite provides persistence across restarts.
 */
export class KnowledgeStore {
  private _data: Map<string, Map<string, StoreEntry>> = new Map();

  constructor() {
    this._loadFromDb();
  }

  // ── Bootstrap from SQLite ────────────────────────────────────────

  private _loadFromDb(): void {
    const db = getDb();
    const rows = db
      .prepare('SELECT namespace, id, value, tags, embedding FROM chunks')
      .all() as {
      namespace: string;
      id: string;
      value: string;
      tags: string;
      embedding: Buffer | null;
    }[];

    for (const row of rows) {
      let nsMap = this._data.get(row.namespace);
      if (!nsMap) {
        nsMap = new Map();
        this._data.set(row.namespace, nsMap);
      }
      nsMap.set(row.id, {
        value: row.value,
        tags: JSON.parse(row.tags) as string[],
        embedding: row.embedding ? bufferToEmbedding(row.embedding) : [],
      });
    }
  }

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Store a value under a namespace with tags and an embedding vector.
   */
  async store(
    namespace: string,
    id: string,
    value: string,
    tags: string[],
    embedding: number[],
  ): Promise<void> {
    // Persist to SQLite
    const db = getDb();
    db.prepare(
      `INSERT OR REPLACE INTO chunks (namespace, id, value, tags, embedding)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(namespace, id, value, JSON.stringify(tags), embeddingToBuffer(embedding));

    // Update in-memory cache
    let nsMap = this._data.get(namespace);
    if (!nsMap) {
      nsMap = new Map();
      this._data.set(namespace, nsMap);
    }
    nsMap.set(id, { value, tags, embedding });
  }

  /**
   * Search a namespace by cosine similarity to the query embedding.
   * Returns up to `topK` results sorted by descending score.
   */
  async search(
    namespace: string,
    queryEmbedding: number[],
    topK: number = 5,
  ): Promise<SearchResult[]> {
    const nsMap = this._data.get(namespace);
    if (!nsMap || nsMap.size === 0) return [];

    const scored: SearchResult[] = [];
    for (const [key, entry] of nsMap) {
      const score = cosineSimilarity(queryEmbedding, entry.embedding);
      scored.push({ key, value: entry.value, tags: entry.tags, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /**
   * Retrieve all entries in a namespace.
   */
  async getAll(
    namespace: string,
  ): Promise<{ key: string; value: string; tags: string[]; embedding: number[] }[]> {
    const nsMap = this._data.get(namespace);
    if (!nsMap) return [];

    const results: { key: string; value: string; tags: string[]; embedding: number[] }[] = [];
    for (const [key, entry] of nsMap) {
      results.push({ key, value: entry.value, tags: entry.tags, embedding: entry.embedding });
    }
    return results;
  }

  /**
   * Get the count of entries per namespace.
   */
  getStats(): { namespaces: Record<string, number> } {
    const namespaces: Record<string, number> = {};
    for (const [ns, nsMap] of this._data) {
      namespaces[ns] = nsMap.size;
    }
    return { namespaces };
  }

  /**
   * Check whether a namespace exists and has entries.
   */
  hasNamespace(namespace: string): boolean {
    const nsMap = this._data.get(namespace);
    return nsMap !== undefined && nsMap.size > 0;
  }

  /**
   * Remove all entries from a namespace.
   */
  clearNamespace(namespace: string): void {
    const db = getDb();
    db.prepare('DELETE FROM chunks WHERE namespace = ?').run(namespace);
    this._data.delete(namespace);
  }

  /**
   * Remove all data from all namespaces.
   */
  clearAll(): void {
    const db = getDb();
    db.prepare('DELETE FROM chunks').run();
    this._data.clear();
  }
}

/** Singleton knowledge store instance. */
export const knowledgeStore = new KnowledgeStore();
