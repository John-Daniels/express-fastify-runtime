/**
 * Proxy Fastify → Express when request is not handled by Fastify lane.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Application } from 'express';

/**
 * Mount Express app so that unhandled Fastify requests are proxied to it.
 * We pass the raw Node req/res to Express; Express handles the request.
 */
export function mountExpress(fastify: FastifyInstance, expressApp: Application): void {
  fastify.setNotFoundHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request.raw;
    const res = reply.raw;
    (expressApp as (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, next: (err?: Error) => void) => void)(req, res, (err?: Error) => {
      if (err) {
        reply.send(err);
        return;
      }
      if (!res.writableEnded) {
        res.statusCode = 404;
        res.end();
      }
    });
  });
}
