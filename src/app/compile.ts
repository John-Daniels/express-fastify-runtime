/**
 * Compile classified routes to Fastify (preHandler + routes).
 * Single compile; no runtime middleware resolution.
 * Optimized: reusable adapters, sync-first middleware loop, minimal Promise.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ClassifiedRoute } from "../types/internal.js";
import type {
  ExpressRequest,
  ExpressResponse,
  ExpressHandler,
  NextFunction,
} from "../types/express.js";
import type { RequestAdapter } from "../types/internal.js";
import type { ResponseAdapter } from "../types/internal.js";
import { normalizePath } from "../utils/path.js";
import { isExpressJson, expressJsonPassthrough } from "../express/middleware.js";

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

/**
 * Run middleware chain: sync-first loop, only await when handler returns thenable.
 * Uses nextCalled (not index comparison) so we correctly stop when a handler does not call next().
 */
async function runMiddlewareChain(
  handlers: Array<
    (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => void
  >,
  req: ExpressRequest,
  res: ExpressResponse,
  _reply: FastifyReply,
): Promise<void> {
  let i = 0;
  while (i < handlers.length) {
    let nextCalled = false;
    const next: NextFunction = (err?: Error | unknown) => {
      if (err) throw err;
      nextCalled = true;
    };
    const fn = handlers[i++];
    const result = fn(req, res, next) as void | Promise<void>;
    if (
      result != null &&
      typeof (result as Promise<unknown>).then === "function"
    ) {
      await (result as unknown as Promise<void>);
    }
    if (!nextCalled) return;
  }
}

/** Attach adapted req/res to Fastify request so handler reuses them (adapt once per request). */
const kExpressReq = Symbol.for("express-fastify-runtime.req");
const kExpressRes = Symbol.for("express-fastify-runtime.res");

type RequestWithExpress = FastifyRequest & {
  [kExpressReq]?: ExpressRequest;
  [kExpressRes]?: ExpressResponse;
};

/**
 * Build preHandler: adapt once, run applicable middleware (that appear before this route in the stack), attach req/res for handler.
 * Only middleware with index < routeIndex in classified is run, so catch-all 404 handlers after the route do not run first.
 */
function buildPreHandlersForPath(
  routePath: string,
  classified: ClassifiedRoute[],
  routeIndex: number,
  adaptRequest: RequestAdapter,
  adaptResponse: ResponseAdapter,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  const applicable: Array<
    (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => void
  > = [];
  for (let i = 0; i < classified.length && i < routeIndex; i++) {
    const c = classified[i];
    if (c.lane !== "fastify" || c.type !== "middleware") continue;
    const path = c.path === "/" ? "/" : normalizePath(c.path);
    if (!pathMatches(path, routePath)) continue;
    for (const h of c.handlers) {
      const fn = isExpressJson(h as ExpressHandler)
        ? (expressJsonPassthrough() as (
            req: ExpressRequest,
            res: ExpressResponse,
            next: NextFunction,
          ) => void)
        : (h as (
            req: ExpressRequest,
            res: ExpressResponse,
            next: NextFunction,
          ) => void);
      applicable.push(fn);
    }
  }
  return async (request: RequestWithExpress, reply: FastifyReply) => {
    const req = adaptRequest(request);
    const res = adaptResponse(reply, request);
    request[kExpressReq] = req;
    request[kExpressRes] = res;
    await runMiddlewareChain(applicable, req, res, reply);
  };
}

/**
 * Run route handlers (middleware + final handler). Sync-first; index-based next (no boolean).
 */
async function runRouteHandlers(
  handlers: Array<
    (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => void
  >,
  req: ExpressRequest,
  res: ExpressResponse,
  reply: FastifyReply,
): Promise<void> {
  let i = 0;
  while (i < handlers.length) {
    let nextCalled = false;
    const next: NextFunction = (err?: Error | unknown) => {
      if (err) throw err;
      nextCalled = true;
    };
    const fn = handlers[i++] as (
      req: ExpressRequest,
      res: ExpressResponse,
      next: NextFunction,
    ) => void;
    const result = fn(req, res, next) as void | Promise<void>;
    if (
      result != null &&
      typeof (result as Promise<unknown>).then === "function"
    ) {
      await (result as unknown as Promise<void>);
    }
    if (!nextCalled) break;
  }
  if (reply.sent) return;
  await new Promise<void>((r) => reply.raw.once("finish", r));
}

export interface RegisterFastifyRoutesOptions {
  diagnostics?: boolean;
}

/**
 * Register compiled Fastify routes (safe route entries only).
 * Adapt once in preHandler; handler reuses req/res from request.
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

  const routeEntries = classified.filter(
    (c) => c.type === "route" && c.lane === "fastify",
  );
  for (const entry of routeEntries) {
    if (entry.type !== "route") continue;
    const path = normalizePath(entry.path);
    const routeIndex = classified.indexOf(entry);
    const methods =
      entry.method === "all"
        ? ([
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
            "HEAD",
            "OPTIONS",
          ] as const)
        : [entry.method.toUpperCase()];
    const preHandler = buildPreHandlersForPath(
      path,
      classified,
      routeIndex,
      adaptRequest,
      adaptResponse,
    );
    const handlers = (entry.handlers as ExpressHandler[]).map((h) =>
      isExpressJson(h) ? expressJsonPassthrough() : h,
    ) as Array<
      (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => void
    >;

    for (const m of methods) {
      const diagnosticsPreHandler =
        diagnostics
          ? async (request: FastifyRequest) => {
              const url = request.url ?? path;
              console.log(`[express-fastify-runtime] Fastify lane: ${m} ${url}`);
            }
          : undefined;

      const preHandlers =
        diagnosticsPreHandler != null
          ? [diagnosticsPreHandler, preHandler]
          : [preHandler];

      fastify.route({
        method: m,
        url: path,
        preHandler: preHandlers,
        handler: async (request, reply) => {
          const req = (request as RequestWithExpress)[kExpressReq]!;
          const res = (request as RequestWithExpress)[kExpressRes]!;
          // Set baseUrl from route path so handlers see Express-like base (e.g. /v1 for /v1/admins/auth/login)
          const segments = path.split("/").filter(Boolean);
          req.baseUrl = segments.length >= 1 ? "/" + segments[0] : "";
          await runRouteHandlers(
            handlers as Array<
              (
                req: ExpressRequest,
                res: ExpressResponse,
                next: NextFunction,
              ) => void
            >,
            req,
            res,
            reply,
          );
        },
      });
    }
  }
}
