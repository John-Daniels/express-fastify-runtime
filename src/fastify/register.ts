/**
 * Registers the Fastify instance with compiled routes and Express fallback.
 */

import type { FastifyInstance } from 'fastify';
import type { ClassifiedRoute } from '../types/internal.js';
import type { ExpressRequest, ExpressResponse, NextFunction } from '../types/express.js';
import { createRequestAdapter } from './adapters/request.js';
import { adaptResponse } from './adapters/response.js';
import { registerFastifyRoutes } from '../app/compile.js';

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
  // One-shot adaptResponse so each request gets its own res with morgan-friendly 'finish' emit (no reused res).
  registerFastifyRoutes(fastify, classified, adaptRequest, adaptResponse, runMiddleware, options);
}
