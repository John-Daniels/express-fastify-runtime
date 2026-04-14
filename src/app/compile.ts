/**
 * Compile classified routes to Fastify (preHandler + routes).
 * Maximize work at compile/registration time; at runtime we only adapt req/res and run
 * prebuilt handler chains. No runtime middleware resolution; reusable adapters; sync-first.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
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
  const hasMiddleware = applicable.length > 0;
  return async (request: RequestWithExpress, reply: FastifyReply) => {
    applyMaxListeners(request.raw, reply.raw);
    const req = adaptRequest(request);
    const res = adaptResponse(reply, request);
    request[kExpressReq] = req;
    request[kExpressRes] = res;
    (res as ExpressResponse & { req?: ExpressRequest }).req = req;
    if (hasMiddleware) await runMiddlewareChain(applicable, req, res, reply);
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
  // Do NOT await reply.raw.once('finish') here. With keep-alive (e.g. Postman),
  // Node emits 'finish' only when the response is flushed to the OS. If we keep
  // the handler open waiting for 'finish', the request stays "in flight" and the
  // socket may not flush until the client disconnects — so morgan and res.on('finish')
  // would only run on disconnect. Express returns immediately after res.send(), so
  // the connection can flush and 'finish' fires in a timely way. We match that:
  // return as soon as route handlers have run; morgan/on-finished still run when
  // the raw response actually finishes (or on socket 'close').
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
          // Morgan's :response-time needs res._startAt. Morgan sets it via onHeaders(res, recordStartTime)
          const raw = reply.raw as import("node:http").ServerResponse & {
            _efrWriteHeadPatched?: boolean;
          };
          if (!raw._efrWriteHeadPatched) {
            raw._efrWriteHeadPatched = true;
            const origWriteHead = raw.writeHead.bind(raw);
            raw.writeHead = function (this: import("node:http").ServerResponse, ...args: unknown[]) {
              const resAny = res as ExpressResponse & { _startAt?: [number, number]; _startTime?: Date };
              if (resAny._startAt === undefined) {
                resAny._startAt = process.hrtime();
                resAny._startTime = new Date();
              }
              return (origWriteHead as (...a: unknown[]) => ReturnType<typeof origWriteHead>).apply(this, args);
            };
          }
          const segments = path.split("/").filter(Boolean);
          req.baseUrl = segments.length >= 1 ? "/" + segments[0] : "";
          // Fast path: single handler — no loop, no next() (per PLAN_FASTIFY_CLOSER.md Tier 1.1).
          if (handlers.length === 1) {
            const fn = handlers[0];
            const result = fn(req, res, (err?: Error | unknown) => {
              if (err) throw err;
            }) as void | Promise<void>;
            if (result != null && typeof (result as Promise<unknown>).then === "function") {
              await (result as unknown as Promise<void>);
            }
          } else {
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
          }
        },
      });
    }
  }
}
