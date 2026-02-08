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
