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
