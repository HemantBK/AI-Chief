/**
 * GET /api/metrics - Dashboard metrics data
 */

import { FastifyInstance } from 'fastify';
import { metricsCollector } from '../../monitoring/metrics.js';
import { safetyAdaptation } from '../../safety/adaptation.js';

export async function metricsRoutes(fastify: FastifyInstance): Promise<void> {
  // Full dashboard data
  fastify.get('/api/metrics', async (_request, reply) => {
    const dashboard = metricsCollector.getDashboard();
    const adaptation = safetyAdaptation.getStats();

    return reply.send({
      success: true,
      data: {
        ...dashboard,
        safety_adaptation: adaptation,
      },
    });
  });

  // Safety score trend (for chart)
  fastify.get('/api/metrics/safety-trend', async (_request, reply) => {
    const trend = metricsCollector.getSafetyTrend(50);
    return reply.send({ success: true, data: trend });
  });

  // Recent safety flags
  fastify.get('/api/metrics/safety-flags', async (_request, reply) => {
    const all = metricsCollector.getAll();
    const flagged = all
      .filter(m => m.safety_flags.length > 0)
      .slice(-30)
      .reverse()
      .map(m => ({
        timestamp: m.timestamp,
        query: m.query,
        safety_score: m.safety_score,
        flags: m.safety_flags,
      }));

    return reply.send({ success: true, data: flagged });
  });

  // All raw metrics (admin)
  fastify.get('/api/metrics/raw', async (_request, reply) => {
    return reply.send({
      success: true,
      data: metricsCollector.getAll(),
      count: metricsCollector.getCount(),
    });
  });
}
