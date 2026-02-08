/**
 * Passthrough helpers for Express middleware (e.g. express.json interception).
 */

import type { ExpressHandler } from '../types/express.js';

/**
 * Detect express.json() so we can map it to Fastify JSON parser instead of Express lane.
 * Express 4: bodyParser.json / express; Express 5: named jsonParser, body calls read(req, res, next, parse).
 */
export function isExpressJson(fn: ExpressHandler): boolean {
  if (typeof fn !== 'function') return false;
  const name = (fn as unknown as { name?: string }).name ?? '';
  const str = fn.toString();
  if (name === 'jsonParser') return true; // Express 5
  return str.includes('json') && (str.includes('bodyParser') || str.includes('express'));
}

/**
 * No-op for express.json() when we use Fastify's built-in JSON; keeps middleware stack shape.
 */
export function expressJsonPassthrough(): ExpressHandler {
  return (req: import('../types/express.js').ExpressRequest, res: import('../types/express.js').ExpressResponse, next: import('../types/express.js').NextFunction) => next();
}
