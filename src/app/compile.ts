/**
 * Compile classified routes to Fastify (preHandler + routes).
 * Single compile; no runtime middleware resolution.
 * Optimized: reusable adapters, sync-first middleware loop, minimal Promise.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ClassifiedRoute } from '../types/internal.js';
import type { ExpressRequest, ExpressResponse, NextFunction } from '../types/express.js';
import type { RequestAdapter } from '../types/internal.js';
import type { ResponseAdapter } from '../types/internal.js';
import { normalizePath } from '../utils/path.js';

export type RunMiddleware = (
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction
) => void | Promise<void>;

/** Path prefix match: middleware at /api applies to /api, /api/users, etc. */
function pathMatches(middlewarePath: string, routePath: string): boolean {
  const m = normalizePath(middlewarePath);
  const r = normalizePath(routePath);
  if (m === '/' || m === '') return true;
  return r === m || r.startsWith(m + '/');
}

/**
 * Run middleware chain: sync-first loop, only await when handler returns thenable.
 */
async function runMiddlewareChain(
  handlers: Array<(req: ExpressRequest, res: ExpressResponse, next: NextFunction) => void>,
  req: ExpressRequest,
  res: ExpressResponse,
  _reply: FastifyReply
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
    if (result != null && typeof (result as Promise<unknown>).then === 'function') {
      await (result as unknown as Promise<void>);
    }
    if (!nextCalled) return;
  }
}

/**
 * Build preHandler that runs applicable Fastify-safe middleware for a route path.
 */
function buildPreHandlersForPath(
  routePath: string,
  classified: ClassifiedRoute[],
  adaptRequest: RequestAdapter,
  adaptResponse: ResponseAdapter
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  const applicable: Array<(req: ExpressRequest, res: ExpressResponse, next: NextFunction) => void> = [];
  for (const c of classified) {
    if (c.lane !== 'fastify' || c.type !== 'middleware') continue;
    const path = c.path === '/' ? '/' : normalizePath(c.path);
    if (!pathMatches(path, routePath)) continue;
    for (const h of c.handlers) {
      applicable.push(h as (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => void);
    }
  }
  if (applicable.length === 0) {
    return async () => {};
  }
  return async (request, reply) => {
    const req = adaptRequest(request);
    const res = adaptResponse(reply, request);
    await runMiddlewareChain(applicable, req, res, reply);
  };
}

/**
 * Run route handlers (middleware + final handler). Sync-first; single Promise only when waiting for response finish.
 */
async function runRouteHandlers(
  handlers: Array<(req: ExpressRequest, res: ExpressResponse, next: NextFunction) => void>,
  req: ExpressRequest,
  res: ExpressResponse,
  reply: FastifyReply
): Promise<void> {
  let i = 0;
  while (i < handlers.length) {
    let nextCalled = false;
    const next: NextFunction = (err?: Error | unknown) => {
      if (err) throw err;
      nextCalled = true;
    };
    const fn = handlers[i++] as (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => void;
    const result = fn(req, res, next) as void | Promise<void>;
    if (result != null && typeof (result as Promise<unknown>).then === 'function') {
      await (result as unknown as Promise<void>);
    }
    if (!nextCalled) break;
  }
  if (reply.sent) return;
  await new Promise<void>((resolve) => {
    reply.raw.once('finish', resolve);
  });
}

/**
 * Register compiled Fastify routes (safe route entries only).
 */
export function registerFastifyRoutes(
  fastify: FastifyInstance,
  classified: ClassifiedRoute[],
  adaptRequest: RequestAdapter,
  adaptResponse: ResponseAdapter,
  _runMiddleware: RunMiddleware
): void {
  const routeEntries = classified.filter((c) => c.type === 'route' && c.lane === 'fastify');
  for (const entry of routeEntries) {
    if (entry.type !== 'route') continue;
    const path = normalizePath(entry.path);
    const methods =
      entry.method === 'all'
        ? (['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const)
        : [entry.method.toUpperCase()];
    const preHandler = buildPreHandlersForPath(path, classified, adaptRequest, adaptResponse);
    const handlers = entry.handlers;

    for (const m of methods) {
      fastify.route({
        method: m,
        url: path,
        preHandler: [preHandler],
        handler: async (request, reply) => {
          const req = adaptRequest(request);
          const res = adaptResponse(reply, request);
          await runRouteHandlers(
            handlers as Array<(req: ExpressRequest, res: ExpressResponse, next: NextFunction) => void>,
            req,
            res,
            reply
          );
        },
      });
    }
  }
}
