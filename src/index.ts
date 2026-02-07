/**
 * express-fastify-runtime
 * Run existing Express apps on Fastify safely, faster, and without code changes.
 */

export { createApp } from './runtime/lifecycle.js';
export type { CreateAppOptions } from './runtime/lifecycle.js';
export type { ExpressRequest, ExpressResponse, NextFunction, ExpressMiddleware, ExpressHandler } from './types/express.js';
