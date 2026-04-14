/**
 * express-fastify-runtime
 * Run existing Express apps on Fastify safely, faster, and without code changes.
 */

import "./utils/patchRouterLayer";

export { createApp } from "./runtime/lifecycle";
export type { CreateAppOptions } from "./runtime/lifecycle";
export { fast } from "./runtime/fast";
export type { FastOps, FastOpsExperimental } from "./runtime/fast";
export {
  expressLane,
  ExpressLane,
  EXPRESS_LANE,
  isExpressLaneHandler,
} from "./runtime/expressLane";
export type { ServerLike, UseHandler } from "./types/internal";
export type {
  ExpressRequest,
  ExpressResponse,
  NextFunction,
  ExpressMiddleware,
  ExpressHandler,
  CookieOptions,
} from "./types/express";
