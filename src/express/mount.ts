/**
 * Proxy Fastify → Express when request is not handled by Fastify lane.
 * We pass adapted req/res so Express middleware (including 4-arg error handlers) see .status(), .json(), etc.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Application } from 'express';
import { createRequestAdapter } from '../fastify/adapters/request.js';
import { createResponseAdapter } from '../fastify/adapters/response.js';
import type { ExpressRequest, ExpressResponse } from '../types/express.js';

/**
 * Mount Express app so that unhandled Fastify requests are proxied to it.
 * Uses adapted req/res so Express error handlers and middleware work (e.g. res.status(500).json()).
 */
export function mountExpress(fastify: FastifyInstance, expressApp: Application): void {
  const adaptRequest = createRequestAdapter();
  const adaptResponse = createResponseAdapter();

  fastify.setNotFoundHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const req = adaptRequest(request);
    const res = adaptResponse(reply, request);
    (expressApp as (req: ExpressRequest, res: ExpressResponse, next: (err?: Error) => void) => void)(req, res, (err?: Error) => {
      if (err && !reply.sent) {
        reply.send(err);
        return;
      }
      if (!reply.sent) {
        reply.code(404).send();
      }
    });
  });
}
