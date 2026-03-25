import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { QueryMetric } from '../types.js';

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

/**
 * Persistence layer for query metrics and user feedback.
 * Uses the same SQLite database as the KnowledgeStore (data/knowledge.db).
 */
export class MetricsPersistence {
  /**
   * Insert a query metric into the metrics table.
   */
  saveMetric(metric: QueryMetric): void {
    const db = getDb();
    db.prepare(
      'INSERT INTO metrics (timestamp, data) VALUES (?, ?)',
    ).run(metric.timestamp, JSON.stringify(metric));
  }

  /**
   * Load all persisted metrics from the DB.
   */
  loadMetrics(): QueryMetric[] {
    const db = getDb();
    const rows = db
      .prepare('SELECT data FROM metrics ORDER BY id ASC')
      .all() as { data: string }[];

    return rows.map((row) => JSON.parse(row.data) as QueryMetric);
  }

  /**
   * Save user feedback for a specific query.
   */
  saveFeedback(queryId: string, helpful: boolean, comment?: string): void {
    const db = getDb();
    db.prepare(
      'INSERT INTO feedback (query_id, helpful, comment) VALUES (?, ?, ?)',
    ).run(queryId, helpful ? 1 : 0, comment ?? null);
  }

  /**
   * Retrieve all feedback entries.
   */
  getFeedback(): { queryId: string; helpful: boolean; comment?: string }[] {
    const db = getDb();
    const rows = db
      .prepare('SELECT query_id, helpful, comment FROM feedback ORDER BY id ASC')
      .all() as { query_id: string; helpful: number; comment: string | null }[];

    return rows.map((row) => ({
      queryId: row.query_id,
      helpful: row.helpful === 1,
      ...(row.comment != null ? { comment: row.comment } : {}),
    }));
  }
}

/** Singleton metrics persistence instance. */
export const metricsPersistence = new MetricsPersistence();
