/**
 * POST /api/feedback - Submit user feedback on a response
 * GET  /api/feedback - Get all feedback (admin)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { safetyAdaptation } from '../../safety/adaptation.js';

// In-memory feedback store (will be upgraded to SQLite by persistence layer)
interface FeedbackEntry {
  id: number;
  query_id: string;
  helpful: boolean;
  comment?: string;
  timestamp: string;
}

const feedbackStore: FeedbackEntry[] = [];
let nextId = 1;

const feedbackSchema = z.object({
  query_id: z.string().min(1, 'query_id is required'),
  helpful: z.boolean(),
  comment: z.string().max(500).optional(),
});

export async function feedbackRoutes(fastify: FastifyInstance): Promise<void> {
  // Submit feedback
  fastify.post('/api/feedback', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = feedbackSchema.parse(request.body);

      const entry: FeedbackEntry = {
        id: nextId++,
        query_id: body.query_id,
        helpful: body.helpful,
        comment: body.comment,
        timestamp: new Date().toISOString(),
      };
      feedbackStore.push(entry);

      // Feed into SONA adaptation: helpful = high quality signal, unhelpful = low
      await safetyAdaptation.adapt(body.helpful ? 0.9 : 0.3);

      console.log(`[Feedback] ${body.helpful ? '👍' : '👎'} for query ${body.query_id}${body.comment ? `: "${body.comment}"` : ''}`);

      return reply.status(201).send({
        success: true,
        data: { id: entry.id },
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid feedback',
          details: error.errors.map(e => e.message),
        });
      }
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // Get all feedback (admin)
  fastify.get('/api/feedback', async (_request, reply) => {
    const totalFeedback = feedbackStore.length;
    const helpfulCount = feedbackStore.filter(f => f.helpful).length;
    const unhelpfulCount = totalFeedback - helpfulCount;
    const helpfulRate = totalFeedback > 0 ? helpfulCount / totalFeedback : 0;

    return reply.send({
      success: true,
      data: {
        total: totalFeedback,
        helpful: helpfulCount,
        unhelpful: unhelpfulCount,
        helpful_rate: Math.round(helpfulRate * 1000) / 1000,
        recent: feedbackStore.slice(-20).reverse(),
      },
    });
  });
}
