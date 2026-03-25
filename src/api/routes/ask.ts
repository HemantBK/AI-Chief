/**
 * POST /api/ask - Submit a food science question
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { coordinator } from '../../agents/coordinator.js';

const askSchema = z.object({
  question: z.string()
    .min(3, 'Question must be at least 3 characters')
    .max(1000, 'Question must be under 1000 characters')
    .trim(),
});

export async function askRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/ask', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = askSchema.parse(request.body);

      console.log(`\n[API] POST /api/ask: "${body.question}"`);

      const response = await coordinator.processQuestion(body.question);

      return reply.status(200).send({
        success: true,
        data: response,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid request',
          details: error.errors.map(e => e.message),
        });
      }

      console.error('[API] Error processing question:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to process question',
        message: error.message,
      });
    }
  });
}
