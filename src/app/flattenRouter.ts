/**
 * Flatten express.Router() into RouteStore entries so router routes and
 * router.use() middleware can be classified and run on the Fastify lane when safe.
 *
 * When the router package's Layer is patched (see patchRouterLayer.ts), middleware
 * layers expose layer._path so we can flatten router.use(path, fn) too. Otherwise
 * we only flatten routers that have no middleware layers (route-only).
 */

import type { RouteEntry } from '../types/internal';
import type { ExpressHandler } from '../types/express';
import { isExpressLaneHandler } from '../runtime/expressLane';
import { expressJsonPassthrough } from '../express/middleware';
import { joinPath } from '../utils/path';

/**
 * Express body parsers, identified by layer/sub-layer `name` (Express preserves it even when an
 * APM like OpenTelemetry/Sentry wraps the handler, so handle.name becomes e.g. "patched").
 *
 * - express.json() → Fastify already parses JSON, so on the Fastify lane the parser is a no-op
 *   (`expressJsonPassthrough`); req.body comes from Fastify. Otherwise the real jsonParser would
 *   try to read the already-consumed request stream and throw "argument stream must be a stream".
 * - express.urlencoded()/raw()/text() read the raw stream and Fastify has no parser for those
 *   content types — they're left as-is so classify() (utils/detect) routes routes/middleware
 *   using them to the Express lane (real Express parses the body).
 */
function neutralizeJsonParser(name: string | undefined, handle: ExpressHandler): ExpressHandler {
  return name === 'jsonParser' ? (expressJsonPassthrough() as ExpressHandler) : handle;
}

/** Minimal Express Router shape (express + router package). */
export interface ExpressRouterLike {
  stack: ExpressLayerLike[];
}

/** Layer: either middleware (no route) or route (has route). _path is set by our patch for middleware. */
export interface ExpressLayerLike {
  path?: string;
  /** Layer name — Express sets it from the original handler's name and KEEPS it even when an
   * instrumentation library (e.g. OpenTelemetry/Sentry) wraps the handler. More reliable than
   * handle.name for identifying Express built-ins. */
  name?: string;
  /** Set by patchRouterLayer when Layer(path, options, fn) is called with a string path. */
  _path?: string;
  /** router.use('/') creates a layer with slash: true. */
  slash?: boolean;
  handle: ExpressHandler | ExpressRouterLike;
  route?: ExpressRouteLike;
}

/** Route has path, methods, and stack of method handlers. */
export interface ExpressRouteLike {
  path: string;
  methods: Record<string, boolean>;
  stack: Array<{ method?: string; name?: string; handle: ExpressHandler }>;
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

/**
 * Returns true if the value looks like an Express Router (has stack array).
 */
export function isExpressRouter(value: unknown): value is ExpressRouterLike {
  if (value == null || typeof value !== 'function') return false;
  const obj = value as unknown as Record<string, unknown>;
  return Array.isArray(obj.stack);
}

/**
 * Returns true if the value looks like a mounted Express sub-app (`app.use('/x', express())`).
 * A sub-app is a function with its own settings/router but no top-level `.stack` (its stack lives on
 * `app._router`). We don't flatten sub-apps (they have their own settings/init); they run on the
 * Express lane as a unit.
 */
export function isExpressApp(value: unknown): boolean {
  if (value == null || typeof value !== 'function') return false;
  const obj = value as unknown as Record<string, unknown>;
  if (Array.isArray(obj.stack)) return false; // that's a Router, handled separately
  return typeof obj.handle === 'function' && (obj._router != null || typeof obj.set === 'function');
}

/**
 * Get the path for a middleware layer. Uses _path (from our patch), or '/' when slash is true.
 */
function getMiddlewareLayerPath(layer: ExpressLayerLike): string | null {
  const path = (layer as ExpressLayerLike & { _path?: string })._path;
  if (typeof path === 'string') return path;
  if (layer.slash === true) return '/';
  return null;
}

/**
 * Flatten a Router into RouteEntry[] when possible.
 * - Route layers (router.get/post etc.) are always flattened when we have route.path.
 * - Middleware layers (router.use) are flattened when we have the path (from Layer._path patch or slash).
 * - Nested routers are flattened recursively.
 *
 * Resilient fallback (so ONE un-flattenable router never sinks the whole app):
 * - A nested router we can't flatten (or one mounted with a RegExp/array path) is SKIPPED here and
 *   left on the Express lane as a unit — its routes fall through to the real Express app via the
 *   notFoundHandler, where the full middleware chain (auth, etc.) still runs. Sibling routers keep
 *   compiling onto the Fastify lane.
 * - A *middleware function* whose path we can't read is the one case we still bail on (return null
 *   for the CURRENT router only): we can't tell which routes it guards, so we can't safely compile
 *   any of this router's routes without risking dropping that middleware. The caller (a parent
 *   router, or fast()) then keeps this whole router on the Express lane but continues with siblings.
 */
export function flattenRouter(router: ExpressRouterLike, mountPath: string): RouteEntry[] | null {
  const stack = router.stack;
  if (!stack || stack.length === 0) return [];

  const entries: RouteEntry[] = [];

  for (const layer of stack) {
    if (layer.route) {
      const route = layer.route;
      // Skip RegExp/array routes so they stay on Express lane (res.render, etc.)
      if (typeof route.path !== 'string') continue;
      // Skip routes whose handler(s) are marked with expressLane() or @ExpressLane()
      const hasExpressLaneHandler = route.stack.some((l) => isExpressLaneHandler(l.handle));
      if (hasExpressLaneHandler) continue;
      const fullPath = joinPath(mountPath, route.path);

      for (const method of Object.keys(route.methods)) {
        const m = method === '_all' ? 'all' : method.toLowerCase();
        const handlers = route.stack
          .filter((l) => l.method === undefined || l.method === m)
          .map((l) => neutralizeJsonParser(l.name, l.handle as ExpressHandler));
        if (handlers.length === 0) continue;
        const validMethod = m === 'all' || HTTP_METHODS.includes(m) ? m : null;
        if (!validMethod) continue;
        entries.push({
          type: 'route',
          method: validMethod,
          path: fullPath,
          handlers,
        });
      }
      continue;
    }

    const handle = layer.handle;

    // Express 4 injects `query` and `expressInit` middleware into the app router stack
    // (Express 5 does not). They must NOT run on the Fastify lane: `expressInit` reassigns
    // req/res __proto__ to Express's own objects (which breaks our adapter — e.g. res.setHeader
    // then hits a non-real response and helmet/etc. throw), and Fastify already parses the query
    // string. Identify them by `layer.name` — Express preserves it even when an instrumentation
    // library (OpenTelemetry/Sentry) wraps the handler (then handle.name is the wrapper, e.g.
    // "patched"). Fall back to handle.name for safety.
    const builtinName =
      layer.name || (typeof handle === 'function' ? (handle as { name?: string }).name : '');
    if (builtinName === 'query' || builtinName === 'expressInit') continue;

    // Mounted sub-app (app.use('/x', express())): it has its own settings/init — don't flatten it;
    // leave it on the Express lane as a unit (its routes fall through to the real Express app).
    if (isExpressApp(handle)) continue;

    const middlewarePath = getMiddlewareLayerPath(layer);
    if (middlewarePath === null) {
      // Path unreadable: array/RegExp mount, or an unpatched Layer. If it's a router, leave just
      // that router on the Express lane and keep compiling siblings. If it's a middleware function,
      // we don't know which routes it guards — fall back the CURRENT router only (return null), so
      // we never silently compile a route without a guard middleware that should apply to it.
      if (isExpressRouter(handle)) continue;
      return null;
    }

    if (isExpressLaneHandler(handle)) continue;

    const fullPath = joinPath(mountPath, middlewarePath);

    if (isExpressRouter(handle)) {
      const nested = flattenRouter(handle, fullPath);
      // Can't flatten this sub-router (e.g. it contains an array/RegExp-mounted middleware): leave
      // it on the Express lane as a unit and keep compiling the rest of THIS router. Its routes fall
      // through to the real Express app (with their full middleware chain) via the notFoundHandler.
      if (nested === null) continue;
      entries.push(...nested);
    } else {
      entries.push({
        type: 'middleware',
        path: fullPath,
        handlers: [neutralizeJsonParser(builtinName, handle as ExpressHandler)],
      });
    }
  }

  return entries;
}
