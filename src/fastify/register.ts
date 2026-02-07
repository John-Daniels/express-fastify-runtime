/**
 * Registers the Fastify instance with compiled routes and Express fallback.
 */

import type { FastifyInstance } from 'fastify';
import type { ClassifiedRoute } from '../types/internal.js';
import type { ExpressRequest, ExpressResponse, NextFunction } from '../types/express.js';
import { createRequestAdapter } from './adapters/request.js';
import { createResponseAdapter } from './adapters/response.js';
import { registerFastifyRoutes } from '../app/compile.js';

export function registerCompiledRoutes(
  fastify: FastifyInstance,
  classified: ClassifiedRoute[],
  runMiddleware: (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => void | Promise<void>
): void {
  const adaptRequest = createRequestAdapter();
  const adaptResponse = createResponseAdapter();
  registerFastifyRoutes(fastify, classified, adaptRequest, adaptResponse, runMiddleware);
}
