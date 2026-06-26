/**
 * Compile classified routes to Fastify routes.
 * Maximize work at compile/registration time; at runtime we only adapt req/res and run
 * prebuilt handler chains. No runtime middleware resolution; single handler per route; sync-first.
 */

import type { FastifyInstance } from "fastify";
import type { ClassifiedRoute } from "../types/internal";
import type {
  ExpressRequest,
  ExpressResponse,
  ExpressHandler,
  NextFunction,
} from "../types/express";
import type { RequestAdapter } from "../types/internal";
import type { ResponseAdapter } from "../types/internal";
import { normalizePath } from "../utils/path";
import { applyMaxListeners } from "../utils/maxListeners";
import { isExpressJson, expressJsonPassthrough } from "../express/middleware";
import { toFastifyPath } from "../utils/expressPath";

export type RunMiddleware = (
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction,
) => void | Promise<void>;

/** Path prefix match: middleware at /api applies to /api, /api/users, etc. */
function pathMatches(middlewarePath: string, routePath: string): boolean {
  const m = normalizePath(middlewarePath);
  const r = normalizePath(routePath);
  if (m === "/" || m === "") return true;
  return r === m || r.startsWith(m + "/");
}

/** Shared no-op next() for the single-handler fast path (stateless: only rethrows errors). */
const noopNext: NextFunction = (err?: Error | unknown) => {
  if (err) throw err;
};
const noop = (): void => {};

type Handler = (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => void;

/** Per-request hook the response adapter calls when it ends the response (see ResState._onEnd). */
type ResWithEnd = ExpressResponse & { _onEnd?: (() => void) | null; req?: ExpressRequest };

/**
 * Run an Express-style handler chain the way Express's router does: continuation-based, but
 * sync-first so the common case stays allocation-light.
 *
 * `next()` is the ONLY driver — a handler advances whenever it calls next(): synchronously,
 * from an awaited promise, OR from a detached callback / setTimeout / microtask (classic
 * callback style). A handler that ends the response without next() stops the chain (res.json/
 * send/end signal us via res._onEnd). Errors (sync throw, next(err), or async rejection) are
 * routed to Fastify's error handler.
 *
 * Returns `undefined` when the chain settles synchronously (no Promise allocated — the fast
 * path), or a Promise when a handler defers work (async/await or a detached next()). The only
 * thing that "hangs" is a handler that never calls next() and never responds — as in Express.
 */
function run(handlers: Handler[], req: ExpressRequest, res: ExpressResponse): void | Promise<void> {
  const r = res as ResWithEnd;
  let i = 0;
  let finished = false;
  let syncError: { e: unknown } | null = null; // captured sync error, rethrown after the drive
  let deferred: { resolve: () => void; reject: (e: unknown) => void } | null = null;
  // settle() is inlined into next()/_onEnd to keep per-request closures to a minimum (sync case
  // allocates just _onEnd + next; the async rejection closure is only created if a handler defers).
  const settle = (err?: unknown): void => {
    if (finished) return;
    finished = true;
    r._onEnd = undefined;
    if (err === undefined) {
      if (deferred) deferred.resolve();
    } else if (deferred) {
      deferred.reject(err);
    } else {
      // next(err) is called from inside the handler that run()'s own try/catch wraps, so throwing
      // here would be swallowed. Stash and rethrow once the synchronous drive unwinds.
      syncError = { e: err };
    }
  };
  // If a handler ends the response without calling next(), stop waiting (settle() = success).
  r._onEnd = settle as () => void;
  const next: NextFunction = (err?: Error | unknown) => {
    if (err !== undefined && err !== null) return settle(err);
    if (i >= handlers.length) return settle();
    const fn = handlers[i++];
    let ret: unknown;
    try {
      ret = fn(req, res, next);
    } catch (e) {
      return settle(e);
    }
    if (ret != null && typeof (ret as Promise<unknown>).then === "function") {
      (ret as Promise<unknown>).then(noop, (e) => settle(e));
    }
  };
  next(); // drive synchronously
  if (syncError) throw (syncError as { e: unknown }).e; // sync throw / next(err) → Fastify error handler
  if (finished) return; // settled synchronously → no Promise (fast path)
  return new Promise<void>((resolve, reject) => {
    deferred = { resolve, reject };
    if (finished) resolve();
  });
}

/** Path prefix match wrapper kept above; collect the applicable middleware for a route. */
function collectApplicableMiddleware(
  routePath: string,
  classified: ClassifiedRoute[],
  routeIndex: number,
): Handler[] {
  const applicable: Handler[] = [];
  for (let i = 0; i < classified.length && i < routeIndex; i++) {
    const c = classified[i];
    if (c.lane !== "fastify" || c.type !== "middleware") continue;
    const path = c.path === "/" ? "/" : normalizePath(c.path);
    if (!pathMatches(path, routePath)) continue;
    for (const h of c.handlers) {
      // 4-arg Express error middleware runs via setErrorHandler, never in the normal chain.
      if (typeof h === "function" && (h as { length: number }).length === 4) continue;
      applicable.push(
        (isExpressJson(h as ExpressHandler) ? expressJsonPassthrough() : h) as Handler,
      );
    }
  }
  return applicable;
}

export interface RegisterFastifyRoutesOptions {
  diagnostics?: boolean;
  /**
   * Param names that have `app.param(name, fn)` callbacks registered. Routes whose path uses one of
   * these params are left on the Express lane so the param callbacks actually run (we don't
   * reimplement app.param on the Fastify lane). See runtime/fast.ts / introspectExpress.ts.
   */
  paramNames?: ReadonlySet<string>;
}

/** Path segments like ":id" → "id"; used to skip routes that depend on app.param() callbacks. */
function routeParamNames(path: string): string[] {
  const out: string[] = [];
  for (const m of path.matchAll(/:([A-Za-z_$][\w$]*)/g)) out.push(m[1]);
  return out;
}

/**
 * Register compiled Fastify routes (safe route entries only).
 *
 * One Fastify handler per route (no separate preHandler stage). The full chain
 * [applicable global middleware..., route handlers...] is precomputed at registration:
 * - chain length 1 → call it directly (sync return, no Promise/chain) — the hot path.
 * - chain length >1 → drive it with the continuation runner (correct for every middleware
 *   style, incl. callback-style next()).
 */
export function registerFastifyRoutes(
  fastify: FastifyInstance,
  classified: ClassifiedRoute[],
  adaptRequest: RequestAdapter,
  adaptResponse: ResponseAdapter,
  _runMiddleware: RunMiddleware,
  options?: RegisterFastifyRoutesOptions,
): void {
  const diagnostics = options?.diagnostics === true;

  const ALL_METHODS = [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
  ] as const;
  const expandMethods = (method: string): readonly string[] =>
    method === "all" ? ALL_METHODS : [method.toUpperCase()];

  // Count route entries per concrete method+path across ALL lanes. Express allows the same
  // method+path to be declared more than once (the layers chain via next()); Fastify forbids
  // duplicate method+path. Any method+path declared >1 time is left OFF the Fastify lane and
  // handled by the real embedded Express app (which has every layer and runs them in order).
  const methodPathCount = new Map<string, number>();
  for (const c of classified) {
    if (c.type !== "route") continue;
    const p = normalizePath(c.path);
    for (const m of expandMethods(c.method)) {
      const key = m + " " + p;
      methodPathCount.set(key, (methodPathCount.get(key) ?? 0) + 1);
    }
  }

  const routeEntries = classified.filter(
    (c) => c.type === "route" && c.lane === "fastify",
  );
  const paramNames = options?.paramNames;
  for (const entry of routeEntries) {
    if (entry.type !== "route") continue;
    const path = normalizePath(entry.path);
    // app.param(): a route using a param that has a registered callback runs on the Express lane.
    if (paramNames && paramNames.size > 0 && routeParamNames(path).some((n) => paramNames.has(n))) {
      continue;
    }
    // Translate Express path syntax → Fastify (wildcards). null = untranslatable → Express lane.
    const fastifyPath = toFastifyPath(path);
    if (fastifyPath === null) continue;
    const wildcardKey = fastifyPath.wildcard;
    // baseUrl is constant per route — compute once at registration, not per request.
    const baseUrlSegments = path.split("/").filter(Boolean);
    const baseUrl = baseUrlSegments.length >= 1 ? "/" + baseUrlSegments[0] : "";
    const routeIndex = classified.indexOf(entry);
    // Only register methods that are declared exactly once for this path; duplicates (incl.
    // all+method overlaps, or a same-path entry on the Express lane) defer to the Express lane.
    const methods = expandMethods(entry.method).filter(
      (m) => (methodPathCount.get(m + " " + path) ?? 0) === 1,
    );
    if (methods.length === 0) continue;
    const applicable = collectApplicableMiddleware(path, classified, routeIndex);
    const routeHandlers = (entry.handlers as ExpressHandler[]).map((h) =>
      isExpressJson(h) ? expressJsonPassthrough() : h,
    ) as Handler[];
    const chain = applicable.length ? applicable.concat(routeHandlers) : routeHandlers;
    // Hot path: exactly one handler that doesn't take `next` (arity ≤ 2) can only respond
    // synchronously or return a promise — call it directly, no runner/closures/Promise.
    // Anything that takes `next` (or a multi-handler chain) goes through the continuation runner.
    const fastSingle = chain.length === 1 && (chain[0] as { length: number }).length <= 2 ? chain[0] : null;

    for (const m of methods) {
      const logLane = diagnostics
        ? (request: import("fastify").FastifyRequest) =>
            console.log(`[express-fastify-runtime] Fastify lane: ${m} ${request.url ?? path}`)
        : null;

      try {
        fastify.route({
          method: m,
          url: fastifyPath.url,
          handler: (request, reply) => {
            if (logLane) logLane(request);
            applyMaxListeners(request.raw, reply.raw);
            // Bridge a wildcard: Fastify stores it as params['*']; Express handlers read params[0]
            // (v4) or params.<name> (v5). Set the Express key so handlers find the value.
            if (wildcardKey !== null) {
              const rp = (request as { params?: Record<string, unknown> }).params;
              if (rp && rp["*"] !== undefined) rp[wildcardKey] = rp["*"];
            }
            const req = adaptRequest(request);
            const res = adaptResponse(reply, request);
            (res as ResWithEnd).req = req;
            req.baseUrl = baseUrl;
            if (fastSingle !== null) {
              return fastSingle(req, res, noopNext) as void | Promise<unknown>;
            }
            return run(chain, req, res);
          },
        });
      } catch (err) {
        // Fastify rejected this path (exotic syntax we didn't translate). Never crash boot — leave
        // the route on the Express lane (it falls through to the real Express app), and surface why.
        if (diagnostics) {
          console.log(
            `[express-fastify-runtime] Route ${m} ${path} left on the Express lane (Fastify rejected the path): ${(err as Error).message}`,
          );
        }
      }
    }
  }
}
