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
  NextFunction,
} from "../types/express.js";
import type { RequestAdapter } from "../types/internal.js";
import type { ResponseAdapter } from "../types/internal.js";
import { normalizePath } from "../utils/path.js";

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
 * Build preHandler: adapt once, run applicable middleware, attach req/res for handler.
 */
function buildPreHandlersForPath(
  routePath: string,
  classified: ClassifiedRoute[],
  adaptRequest: RequestAdapter,
  adaptResponse: ResponseAdapter,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  const applicable: Array<
    (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => void
  > = [];
  for (const c of classified) {
    if (c.lane !== "fastify" || c.type !== "middleware") continue;
    const path = c.path === "/" ? "/" : normalizePath(c.path);
    if (!pathMatches(path, routePath)) continue;
    for (const h of c.handlers) {
      applicable.push(
        h as (
          req: ExpressRequest,
          res: ExpressResponse,
          next: NextFunction,
        ) => void,
      );
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
): void {
  const routeEntries = classified.filter(
    (c) => c.type === "route" && c.lane === "fastify",
  );
  for (const entry of routeEntries) {
    if (entry.type !== "route") continue;
    const path = normalizePath(entry.path);
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
      adaptRequest,
      adaptResponse,
    );
    const handlers = entry.handlers;

    for (const m of methods) {
      fastify.route({
        method: m,
        url: path,
        preHandler: [preHandler],
        handler: async (request, reply) => {
          const req = (request as RequestWithExpress)[kExpressReq]!;
          const res = (request as RequestWithExpress)[kExpressRes]!;
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
