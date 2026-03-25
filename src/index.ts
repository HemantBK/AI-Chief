/**
 * AI Chef That Explains Food Science
 * Main entry point - Fastify server
 */

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import { CONFIG } from './config.js';
import { askRoutes } from './api/routes/ask.js';
import { healthRoutes } from './api/routes/health.js';
import { metricsRoutes } from './api/routes/metrics.js';
import { feedbackRoutes } from './api/routes/feedback.js';
import { authMiddleware } from './api/middleware/auth.js';
import { ragEngine } from './rag/index.js';
import { knowledgeStore } from './ingestion/loader.js';
import { runFullIngestion } from './ingestion/index.js';
import { seedSafetyPatterns } from '../scripts/seed-safety-patterns.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log(`
  ╔══════════════════════════════════════════════════════╗
  ║       🧑‍🍳  AI Chef - Food Science Engine  🔬        ║
  ║                                                      ║
  ║  Science-backed answers with safety monitoring       ║
  ║  SQLite persistence • Rate limiting • Safety scoring ║
  ╚══════════════════════════════════════════════════════╝
  `);

  const app = Fastify({
    logger: false,
  });

  // Rate limiting (60 requests per minute per IP)
  await app.register(fastifyRateLimit, {
    max: 60,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      success: false,
      error: 'Too many requests — please slow down',
      statusCode: 429,
    }),
  });

  // CORS
  await app.register(fastifyCors, {
    origin: true,
    methods: ['GET', 'POST'],
  });

  // Optional API key auth
  await app.register(authMiddleware);

  // Static files (UI)
  await app.register(fastifyStatic, {
    root: path.join(__dirname, 'ui'),
    prefix: '/',
  });

  // API routes
  await app.register(askRoutes);
  await app.register(healthRoutes);
  await app.register(metricsRoutes);
  await app.register(feedbackRoutes);

  // Check if knowledge store needs population (ignore safety-patterns for this check)
  const stats = knowledgeStore.getStats();
  const contentNamespaces = Object.entries(stats.namespaces)
    .filter(([ns]) => ns !== 'safety-patterns');
  const contentChunks = contentNamespaces.reduce((sum, [, count]) => sum + count, 0);
  const totalChunks = Object.values(stats.namespaces).reduce((a, b) => a + b, 0);

  if (contentChunks === 0) {
    console.log('[Server] Knowledge store is empty. Running ingestion...');
    try {
      const result = await runFullIngestion();
      console.log('[Server] Ingestion complete:', result.stats);
    } catch (error) {
      console.error('[Server] Ingestion failed (will start with limited knowledge):', error);
    }

    // Seed safety patterns (only if not already seeded)
    if (!knowledgeStore.hasNamespace('safety-patterns')) {
      try {
        await seedSafetyPatterns();
      } catch (error) {
        console.error('[Server] Safety pattern seeding failed:', error);
      }
    } else {
      console.log('[Server] Safety patterns already loaded');
    }
  } else {
    console.log(`[Server] Knowledge store loaded ${totalChunks} chunks across ${Object.keys(stats.namespaces).length} namespaces (from SQLite)`);
  }

  // Initialize RAG engine
  await ragEngine.initialize();

  // Start server
  try {
    await app.listen({ port: CONFIG.PORT, host: CONFIG.HOST });
    console.log(`\n[Server] ✅ AI Chef is running at http://localhost:${CONFIG.PORT}`);
    console.log(`[Server] 💬 Chat: http://localhost:${CONFIG.PORT}`);
    console.log(`[Server] 📊 Dashboard: http://localhost:${CONFIG.PORT}/#dashboard`);
    console.log(`[Server] 🏥 Health: http://localhost:${CONFIG.PORT}/api/health`);
    console.log(`[Server] 📝 Feedback: POST http://localhost:${CONFIG.PORT}/api/feedback`);
  } catch (err) {
    console.error('[Server] Failed to start:', err);
    process.exit(1);
  }
}

main();
