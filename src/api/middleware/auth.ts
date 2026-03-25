/**
 * API Key Authentication Middleware
 * Optional: if API_KEY is set in .env, all /api/* routes require it.
 * Pass via header: X-API-Key: <your-key>
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

const API_KEY = process.env.API_KEY || '';

export async function authMiddleware(fastify: FastifyInstance): Promise<void> {
  if (!API_KEY) {
    console.log('[Auth] No API_KEY set — API is open (set API_KEY in .env to enable auth)');
    return;
  }

  console.log('[Auth] API key authentication enabled');

  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for static files and health check
    if (!request.url.startsWith('/api/') || request.url === '/api/health') {
      return;
    }

    const providedKey = request.headers['x-api-key'] as string;
    if (!providedKey || providedKey !== API_KEY) {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized — provide a valid X-API-Key header',
      });
    }
  });
}
