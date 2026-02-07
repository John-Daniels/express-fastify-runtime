/**
 * express-fastify-runtime
 * Run existing Express apps on Fastify safely, faster, and without code changes.
 */

import './utils/patchRouterLayer.js';

export { createApp } from './runtime/lifecycle.js';
export type { CreateAppOptions } from './runtime/lifecycle.js';
export type { ServerLike } from './types/internal.js';
export type { ExpressRequest, ExpressResponse, NextFunction, ExpressMiddleware, ExpressHandler } from './types/express.js';
