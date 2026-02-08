/**
 * fast(app, ops) — Compile an existing Express app onto Fastify and return the Fastify instance.
 * One-time compilation; no per-request Express router. Load express-fastify-runtime before
 * creating the Express app so router Layer has _path (see patchRouterLayer) for middleware.
 */

import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { Application } from 'express';
import { classifyAll } from '../app/classify.js';
import { introspectExpressApp } from '../app/introspectExpress.js';
import { mountExpress } from '../express/mount.js';
import { registerCompiledRoutes } from '../fastify/register.js';
import type { ExpressRequest, ExpressResponse, NextFunction } from '../types/express.js';

const DEFAULT_OPTS: FastifyServerOptions = {
  logger: false,
  bodyLimit: 10 * 1024 * 1024, // 10MB; matches express.json({ limit: '10mb' })
};

/**
 * Options for fast(). Same as FastifyServerOptions; used when creating the Fastify instance.
 */
export type FastOps = FastifyServerOptions;

/** Normalize Node server.listen(...) args to Fastify listen options. */
function listenArgsToOptions(
  port?: number,
  hostOrBacklogOrCb?: string | number | (() => void),
  cb?: () => void
): { port: number; host?: string; cb?: (err: Error | null, address: string) => void } {
  const options: { port: number; host?: string; cb?: (err: Error | null, address: string) => void } = {
    port: typeof port === 'number' ? port : 0,
  };
  if (typeof hostOrBacklogOrCb === 'string') options.host = hostOrBacklogOrCb;
  else if (typeof hostOrBacklogOrCb === 'function') options.cb = hostOrBacklogOrCb as (err: Error | null, address: string) => void;
  if (typeof cb === 'function') options.cb = cb as (err: Error | null, address: string) => void;
  return options;
}

/**
 * Compile the Express app onto Fastify and return the Fastify instance.
 * - Safe routes and middleware run on the Fastify lane (compiled).
 * - Unsafe or unflattenable parts fall back to Express (notFoundHandler proxies to app).
 * Load express-fastify-runtime before creating the app so middleware paths can be introspected.
 *
 * You can use either fastApp.listen({ port }, cb) or fastApp.server.listen(port, cb).
 * fastApp.server is the Node HTTP server so you can attach WebSockets, Socket.IO, etc.;
 * server.listen() is wrapped to delegate to Fastify's listen() so 404 and internals work.
 * When using Fastify plugins, await fastApp.ready() before listen so plugins are loaded.
 */
export function fast(app: Application, ops?: FastOps): FastifyInstance {
  const fastify = Fastify({ ...DEFAULT_OPTS, ...ops });

  const entries = introspectExpressApp(app as unknown as import('../app/introspectExpress.js').ExpressAppLike);
  if (entries !== null && entries.length > 0) {
    const classified = classifyAll(entries);
    const noop: (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => void = (_req, _res, next) => next();
    registerCompiledRoutes(fastify, classified, noop);
  }

  mountExpress(fastify, app);

  // Wrap server.listen so Express-style server.listen(port, cb) runs Fastify's listen flow
  // (fixes 404 / fourOhFourContext). When Fastify's listen() runs it calls server.listen(opts)
  // again — we detect that re-entry and delegate to the real Node listen to avoid "already listening".
  const server = fastify.server as import('node:http').Server;
  const originalListen = server.listen.bind(server);
  let listenReentry = false;
  const wrappedListen = function (
    this: import('node:http').Server,
    port?: number | import('node:net').ListenOptions,
    hostOrBacklogOrCb?: string | number | (() => void),
    cb?: () => void
  ): import('node:http').Server {
    if (listenReentry) {
      listenReentry = false;
      return (originalListen as (...args: unknown[]) => import('node:http').Server).apply(this, arguments as unknown as unknown[]) as import('node:http').Server;
    }
    const fastifyCb = (err: Error | null, address: string) => {
      if (userCb) userCb(err, address);
    };
    let userCb: ((err: Error | null, address: string) => void) | undefined;
    if (typeof port === 'object' && port !== null && 'port' in port) {
      const opts = port as { port?: number; host?: string };
      userCb = typeof hostOrBacklogOrCb === 'function' ? (hostOrBacklogOrCb as (err: Error | null, address: string) => void) : undefined;
      listenReentry = true;
      try {
        if (userCb) fastify.listen({ port: opts.port ?? 0, host: opts.host }, fastifyCb);
        else fastify.listen({ port: opts.port ?? 0, host: opts.host });
      } catch (e) {
        listenReentry = false;
        throw e;
      }
      return this;
    }
    const options = listenArgsToOptions(
      typeof port === 'number' ? port : 0,
      hostOrBacklogOrCb,
      cb
    );
    userCb = options.cb;
    listenReentry = true;
    try {
      if (userCb) fastify.listen({ port: options.port, host: options.host }, fastifyCb);
      else fastify.listen({ port: options.port, host: options.host });
    } catch (e) {
      listenReentry = false;
      throw e;
    }
    return this;
  };
  (server as { listen: typeof wrappedListen }).listen = wrappedListen;

  return fastify;
}
