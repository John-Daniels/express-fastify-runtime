/**
 * Introspect an existing Express app's router stack to produce RouteEntry[].
 * Used by fast(app, ops) to compile an already-built Express app onto Fastify.
 *
 * Requires that express-fastify-runtime was loaded before the app was created,
 * so that router Layer has _path set for middleware (see patchRouterLayer.ts).
 * If the app cannot be flattened (e.g. unpatched middleware), returns null.
 */

import type { RouteEntry } from '../types/internal';
import type { ExpressLayerLike, ExpressRouterLike } from './flattenRouter';
import { flattenRouter } from './flattenRouter';

/** Express app shape: Express 5 exposes `app.router`; Express 4 uses the private `app._router`. */
export interface ExpressAppLike {
  router?: ExpressRouterLike;
  _router?: ExpressRouterLike;
}

/**
 * Get the app's router stack across Express majors.
 * Express 4: `app._router` (present after the first route/middleware); `app.router` getter THROWS.
 * Express 5: `app.router` is a lazy getter; `app._router` is undefined.
 * Check `_router` first so we never touch Express 4's throwing getter; guard `app.router` anyway.
 */
function getAppRouter(app: ExpressAppLike): ExpressRouterLike | undefined {
  if (app._router) return app._router;
  try {
    return app.router;
  } catch {
    return undefined;
  }
}

/**
 * Walk the app's router stack and convert to RouteEntry[] with mount path '/'.
 * Returns null if the app has middleware layers we can't flatten (e.g. no _path).
 */
export function introspectExpressApp(app: ExpressAppLike): RouteEntry[] | null {
  const router = getAppRouter(app);
  if (!router || !Array.isArray(router.stack) || router.stack.length === 0) {
    return [];
  }
  return flattenRouter(router as ExpressRouterLike, '/');
}

/**
 * Names of params that have `app.param(name, fn)` callbacks registered. Both Express 4 (`router.params`
 * on `app._router`) and the Express 5 `router` package store them as `{ [name]: fn[] }`. Routes using
 * these params run on the Express lane so the callbacks actually fire (we don't reimplement app.param).
 */
export function getAppParamNames(app: ExpressAppLike): Set<string> {
  const router = getAppRouter(app) as (ExpressRouterLike & { params?: Record<string, unknown> }) | undefined;
  const params = router?.params;
  if (!params || typeof params !== 'object') return new Set();
  return new Set(Object.keys(params));
}

/** Express 4-arg error middleware type. */
export type ExpressErrorMiddleware = (
  err: Error,
  req: import('../types/express').ExpressRequest,
  res: import('../types/express').ExpressResponse,
  next: import('../types/express').NextFunction
) => void | Promise<void>;

/**
 * Return the first Express error middleware (4-arg handler) from the app's router stack, if any.
 * Only considers middleware layers (no route), so we don't pick a route's handler by mistake.
 * Used by fast() to wire setErrorHandler so next(err) in the Fastify lane reaches Express error handlers.
 */
export function getExpressErrorMiddleware(app: ExpressAppLike): ExpressErrorMiddleware | null {
  return getAllExpressErrorMiddleware(app)[0] ?? null;
}

/**
 * Return ALL Express error middlewares (4-arg handlers) in registration order. Express runs error
 * middlewares as a chain — an early one (e.g. Sentry's, a logger) captures the error and calls
 * next(err) to defer to the next; the last one maps the status and responds. We must run the whole
 * chain, not just the first, or a deferring handler turns every error into a generic 500.
 */
export function getAllExpressErrorMiddleware(app: ExpressAppLike): ExpressErrorMiddleware[] {
  const router = getAppRouter(app);
  if (!router || !Array.isArray(router.stack)) return [];
  const out: ExpressErrorMiddleware[] = [];
  for (const layer of router.stack as Array<{ route?: unknown; handle: unknown }>) {
    if (layer.route) continue; // skip route layers; only use app-level middleware
    const handle = layer.handle;
    if (typeof handle === 'function' && (handle as Function).length === 4) {
      out.push(handle as ExpressErrorMiddleware);
    }
  }
  return out;
}
