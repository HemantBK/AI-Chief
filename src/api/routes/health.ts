/**
 * GET /api/health - System health check
 */

import { FastifyInstance } from 'fastify';
import { knowledgeStore } from '../../ingestion/loader.js';
import { metricsCollector } from '../../monitoring/metrics.js';
import { safetyAdaptation } from '../../safety/adaptation.js';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/health', async (_request, reply) => {
    const storeStats = knowledgeStore.getStats();
    const adaptationStats = safetyAdaptation.getStats();
    const totalChunks = Object.values(storeStats.namespaces).reduce((a, b) => a + b, 0);

    return reply.send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      components: {
        knowledge_store: {
          status: totalChunks > 0 ? 'loaded' : 'empty',
          total_chunks: totalChunks,
          namespaces: storeStats.namespaces,
        },
        safety_system: {
          status: 'active',
          adaptive_threshold: adaptationStats.currentThreshold,
          ema_quality: adaptationStats.emaQuality,
          queries_processed: adaptationStats.queriesProcessed,
        },
        metrics: {
          total_queries: metricsCollector.getCount(),
        },
      },
    });
  });
}
