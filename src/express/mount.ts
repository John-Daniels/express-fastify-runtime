/**
 * Proxy Fastify → Express when request is not handled by Fastify lane.
 * We pass the real Node req/res (request.raw, reply.raw) so Express APIs like res.render(),
 * res.sendFile(), and view engines work. Express treats them as the real IncomingMessage/ServerResponse.
 *
 * We must wait for Express to finish (call next or send the response) before returning from
 * the notFoundHandler; otherwise Fastify sends its default response and then Express tries to
 * send again → "Cannot set headers after they are sent".
 *
 * Body: Fastify parses application/json (and other types) by default and consumes the request
 * stream. So when we pass request.raw to Express, the body stream is already consumed and
 * express.json() would read nothing. We attach Fastify's parsed body to the request we pass
 * so req.body is available on the Express lane.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Application } from 'express';
import { applyMaxListeners } from '../utils/maxListeners';

/** Express app signature: (req, res, next) => void */
type ExpressRequestListener = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: Error) => void,
) => void;

/** Request with optional body (Express lane uses raw + body from Fastify). */
export type IncomingMessageWithBody = IncomingMessage & { body?: unknown };

/** Options for mountExpress (e.g. diagnostics). */
export interface MountExpressOptions {
  /** When true, log that the request is handled on the Express lane. */
  diagnostics?: boolean;
}

/**
 * Mount Express app so that unhandled Fastify requests are proxied to it.
 * Uses the raw Node request/response so Express middleware and res.render() work.
 * Awaits until Express calls the done callback (or the response is finished) so Fastify
 * does not send a default response before Express has sent.
 * Attaches Fastify's parsed request.body to the request so req.body is available in Express.
 */
export function mountExpress(
  fastify: FastifyInstance,
  expressApp: Application,
  options?: MountExpressOptions,
): void {
  const diagnostics = options?.diagnostics === true;

  fastify.setNotFoundHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    if (diagnostics) {
      const method = request.method ?? "GET";
      const url = request.url ?? "/";
      console.log(`[express-fastify-runtime] Express lane: ${method} ${url}`);
    }

    applyMaxListeners(request.raw, reply.raw);

    const raw = request.raw;
    const res = reply.raw;

    // Fastify already parsed and consumed the body stream. Attach the parsed body AND set
    // body-parser's `_body` flag so Express's express.json()/urlencoded()/etc. SKIP (they early-
    // return when req._body is set) instead of re-reading the now-empty stream. The body must stay
    // WRITABLE: body parsers assign `req.body = ...` unconditionally, and a read-only property
    // throws "Cannot assign to read only property 'body'" on Express 4 (and silently drops the
    // assignment on Express 5). The `_body` flag is what prevents the overwrite, not read-only.
    const bodyFromFastify = await Promise.resolve((request as { body?: unknown }).body);
    const req = raw as IncomingMessageWithBody & { _body?: boolean };
    if (bodyFromFastify !== undefined) {
      req.body = bodyFromFastify;
      req._body = true;
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

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

      (expressApp as unknown as ExpressRequestListener)(req, res, done);
    });
  });
}
