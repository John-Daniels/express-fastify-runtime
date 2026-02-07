/**
 * Flatten express.Router() into RouteStore entries so router routes and
 * router.use() middleware can be classified and run on the Fastify lane when safe.
 *
 * When the router package's Layer is patched (see patchRouterLayer.ts), middleware
 * layers expose layer._path so we can flatten router.use(path, fn) too. Otherwise
 * we only flatten routers that have no middleware layers (route-only).
 */

import type { RouteEntry } from '../types/internal.js';
import type { ExpressHandler } from '../types/express.js';
import { joinPath } from '../utils/path.js';

/** Minimal Express Router shape (express + router package). */
export interface ExpressRouterLike {
  stack: ExpressLayerLike[];
}

/** Layer: either middleware (no route) or route (has route). _path is set by our patch for middleware. */
export interface ExpressLayerLike {
  path?: string;
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
  stack: Array<{ method?: string; handle: ExpressHandler }>;
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
 * - If any middleware layer has no path we can read, return null and the caller mounts the router on Express lane.
 */
export function flattenRouter(router: ExpressRouterLike, mountPath: string): RouteEntry[] | null {
  const stack = router.stack;
  if (!stack || stack.length === 0) return [];

  const entries: RouteEntry[] = [];

  for (const layer of stack) {
    if (layer.route) {
      const route = layer.route;
      const routePath = typeof route.path === 'string' ? route.path : '/';
      const fullPath = joinPath(mountPath, routePath);

      for (const method of Object.keys(route.methods)) {
        const m = method === '_all' ? 'all' : method.toLowerCase();
        const handlers = route.stack
          .filter((l) => l.method === undefined || l.method === m)
          .map((l) => l.handle as ExpressHandler);
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

    const middlewarePath = getMiddlewareLayerPath(layer);
    if (middlewarePath === null) return null;

    const fullPath = joinPath(mountPath, middlewarePath);
    const handle = layer.handle;

    if (isExpressRouter(handle)) {
      const nested = flattenRouter(handle, fullPath);
      if (nested === null) return null;
      entries.push(...nested);
    } else {
      entries.push({
        type: 'middleware',
        path: fullPath,
        handlers: [handle as ExpressHandler],
      });
    }
  }

  return entries;
}
