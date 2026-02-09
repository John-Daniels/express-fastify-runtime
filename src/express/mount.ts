/**
 * Proxy Fastify → Express when request is not handled by Fastify lane.
 * We pass the real Node req/res (request.raw, reply.raw) so Express APIs like res.render(),
 * res.sendFile(), and view engines work. Express treats them as the real IncomingMessage/ServerResponse.
 *
 * We must wait for Express to finish (call next or send the response) before returning from
 * the notFoundHandler; otherwise Fastify sends its default response and then Express tries to
 * send again → "Cannot set headers after they are sent".
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Application } from 'express';

/**
 * Mount Express app so that unhandled Fastify requests are proxied to it.
 * Uses the raw Node request/response so Express middleware and res.render() work.
 * Awaits until Express calls the done callback (or the response is finished) so Fastify
 * does not send a default response before Express has sent.
 */
export function mountExpress(fastify: FastifyInstance, expressApp: Application): void {
  fastify.setNotFoundHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request.raw;
    const res = reply.raw;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      // Express calls next() only when the chain finishes without sending; if a handler
      // sends (res.send()), next is never called. So we also resolve when res finishes.
      res.once('finish', finish);
      res.once('close', finish);

      const done = (err?: Error) => {
        if (settled) return;
        settled = true;
        if (err && !reply.sent) {
          reply.send(err).then(resolve, reject);
          return;
        }
        if (!reply.sent) {
          reply.code(404).send().then(resolve, reject);
          return;
        }
        resolve();
      };

      (expressApp as (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, next: (err?: Error) => void) => void)(req, res, done);
    });
  });
}
