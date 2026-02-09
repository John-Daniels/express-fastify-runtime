/**
 * Introspect an existing Express app's router stack to produce RouteEntry[].
 * Used by fast(app, ops) to compile an already-built Express app onto Fastify.
 *
 * Requires that express-fastify-runtime was loaded before the app was created,
 * so that router Layer has _path set for middleware (see patchRouterLayer.ts).
 * If the app cannot be flattened (e.g. unpatched middleware), returns null.
 */

import type { RouteEntry } from '../types/internal.js';
import type { ExpressLayerLike, ExpressRouterLike } from './flattenRouter.js';
import { flattenRouter } from './flattenRouter.js';

/** Express app shape: has optional router with stack (lazy-initialized). */
export interface ExpressAppLike {
  router?: ExpressRouterLike;
}

/**
 * Walk app.router.stack and convert to RouteEntry[] with mount path '/'.
 * Returns null if the app has middleware layers we can't flatten (e.g. no _path).
 */
export function introspectExpressApp(app: ExpressAppLike): RouteEntry[] | null {
  const router = app.router;
  if (!router || !Array.isArray(router.stack) || router.stack.length === 0) {
    return [];
  }
  return flattenRouter(router as ExpressRouterLike, '/');
}

/** Express 4-arg error middleware type. */
export type ExpressErrorMiddleware = (
  err: Error,
  req: import('../types/express.js').ExpressRequest,
  res: import('../types/express.js').ExpressResponse,
  next: import('../types/express.js').NextFunction
) => void | Promise<void>;

/**
 * Return the first Express error middleware (4-arg handler) from the app's router stack, if any.
 * Only considers middleware layers (no route), so we don't pick a route's handler by mistake.
 * Used by fast() to wire setErrorHandler so next(err) in the Fastify lane reaches Express error handlers.
 */
export function getExpressErrorMiddleware(app: ExpressAppLike): ExpressErrorMiddleware | null {
  const router = app.router;
  if (!router || !Array.isArray(router.stack)) return null;
  for (const layer of router.stack as Array<{ route?: unknown; handle: unknown }>) {
    if (layer.route) continue; // skip route layers; only use app-level middleware
    const handle = layer.handle;
    if (typeof handle === 'function' && (handle as Function).length === 4) {
      return handle as ExpressErrorMiddleware;
    }
  }
  return null;
}
