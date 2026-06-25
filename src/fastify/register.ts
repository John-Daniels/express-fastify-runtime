/**
 * Registers the Fastify instance with compiled routes and Express fallback.
 */

import type { FastifyInstance } from 'fastify';
import type { ClassifiedRoute } from '../types/internal';
import type { ExpressRequest, ExpressResponse, NextFunction } from '../types/express';
import { createRequestAdapter } from './adapters/request';
import { createResponseAdapter } from './adapters/response';
import { registerFastifyRoutes } from '../app/compile';

export interface RegisterCompiledRoutesOptions {
  /** When true, log that the request is handled on the Fastify lane. */
  diagnostics?: boolean;
}

export function registerCompiledRoutes(
  fastify: FastifyInstance,
  classified: ClassifiedRoute[],
  runMiddleware: (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => void | Promise<void>,
  options?: RegisterCompiledRoutesOptions,
): void {
  const adaptRequest = createRequestAdapter();
  const adaptResponse = createResponseAdapter();
  registerFastifyRoutes(fastify, classified, adaptRequest, adaptResponse, runMiddleware, options);
}

/**
 * Make Fastify's JSON body parsing behave like Express's `express.json()`.
 *
 * Fastify's default `application/json` parser rejects an empty body with
 * `FST_ERR_CTP_EMPTY_JSON_BODY` ("Body cannot be empty when content-type is set to
 * 'application/json'"). Express's body-parser tolerates it and sets `req.body = {}`. Clients (axios
 * et al.) routinely send `Content-Type: application/json` with no body on bodyless POST/PUT/DELETE
 * calls, so the default would 400 requests that work fine on plain Express. Override the parser to
 * match Express: empty body → `{}`, otherwise `JSON.parse` (400 on malformed JSON, as before).
 */
export function installExpressJsonParser(fastify: FastifyInstance): void {
  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      const text = typeof body === 'string' ? body : body == null ? '' : String(body);
      if (text.trim().length === 0) {
        done(null, {}); // Express returns {} for an empty JSON body
        return;
      }
      try {
        done(null, JSON.parse(text));
      } catch (err) {
        (err as { statusCode?: number }).statusCode = 400;
        done(err as Error, undefined);
      }
    },
  );
}
