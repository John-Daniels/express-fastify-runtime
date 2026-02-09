/**
 * express-fastify-runtime
 * Run existing Express apps on Fastify safely, faster, and without code changes.
 */

import './utils/patchRouterLayer.js';

export { createApp } from './runtime/lifecycle.js';
export type { CreateAppOptions } from './runtime/lifecycle.js';
export { fast } from './runtime/fast.js';
export type { FastOps } from './runtime/fast.js';
export {
  expressLane,
  ExpressLane,
  EXPRESS_LANE,
  isExpressLaneHandler,
} from './runtime/expressLane.js';
export type { ServerLike, UseHandler } from './types/internal.js';
export type {
  ExpressRequest,
  ExpressResponse,
  NextFunction,
  ExpressMiddleware,
  ExpressHandler,
  CookieOptions,
} from './types/express.js';
