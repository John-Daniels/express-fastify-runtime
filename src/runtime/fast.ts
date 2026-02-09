/**
 * fast(app, ops) — Compile an existing Express app onto Fastify and return the Fastify instance.
 * One-time compilation; no per-request Express router. Load express-fastify-runtime before
 * creating the Express app so router Layer has _path (see patchRouterLayer) for middleware.
 */

import type { Server } from "node:http";
import type { ListenOptions } from "node:net";
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import type { Application } from "express";
import { classifyAll } from "../app/classify.js";
import {
  introspectExpressApp,
  getExpressErrorMiddleware,
  type ExpressAppLike,
} from "../app/introspectExpress.js";
import { mountExpress } from "../express/mount.js";
import { createRequestAdapter } from "../fastify/adapters/request.js";
import {
  createResponseAdapter,
  adaptResponse as adaptResponseOneShot,
} from "../fastify/adapters/response.js";
import { registerCompiledRoutes } from "../fastify/register.js";
import { wrapErrorHandler } from "./errorHandler.js";
import type {
  ExpressRequest,
  ExpressResponse,
  NextFunction,
} from "../types/express.js";

// Types for the server.listen wrapper (readable names, no inline imports)
type ListenCallback = (err: Error | null, address: string) => void;
interface ListenOptionsResult {
  port: number;
  host?: string;
  cb?: ListenCallback;
}

/** Options for fast(app, ops). More keys can be added later. */
export interface FastOps {
  fastify?: FastifyServerOptions;
}

const DEFAULT_OPTS: FastifyServerOptions = {
  logger: false,
  bodyLimit: 10 * 1024 * 1024, // 10MB; matches express.json({ limit: '10mb' })
};

function listenArgsToOptions(
  port?: number,
  hostOrBacklogOrCb?: string | number | (() => void),
  cb?: () => void,
): ListenOptionsResult {
  const options: ListenOptionsResult = {
    port: typeof port === "number" ? port : 0,
  };
  if (typeof hostOrBacklogOrCb === "string") options.host = hostOrBacklogOrCb;
  else if (typeof hostOrBacklogOrCb === "function")
    options.cb = hostOrBacklogOrCb as ListenCallback;
  if (typeof cb === "function") options.cb = cb as ListenCallback;
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
export function fast(
  app: Application,
  ops?: FastOps | FastifyServerOptions,
): FastifyInstance {
  const fastifyOpts =
    ops && "fastify" in ops
      ? ops.fastify
      : (ops as FastifyServerOptions | undefined);
  const fastify = Fastify({ ...DEFAULT_OPTS, ...fastifyOpts });

  const entries = introspectExpressApp(app as unknown as ExpressAppLike);
  if (entries !== null && entries.length > 0) {
    const classified = classifyAll(entries);
    const noop: (
      req: ExpressRequest,
      res: ExpressResponse,
      next: NextFunction,
    ) => void = (_req, _res, next) => next();
    registerCompiledRoutes(fastify, classified, noop);
  }

  mountExpress(fastify, app);

  const expressErrorMiddleware = getExpressErrorMiddleware(
    app as unknown as ExpressAppLike,
  );
  if (expressErrorMiddleware) {
    const adaptRequest = createRequestAdapter();
    fastify.setErrorHandler(
      wrapErrorHandler(
        expressErrorMiddleware,
        adaptRequest,
        adaptResponseOneShot,
      ),
    );
  }

  // Wrap server.listen so Express-style server.listen(port, cb) runs Fastify's listen flow
  // (fixes 404 / fourOhFourContext). When Fastify's listen() runs it calls server.listen(opts)
  // again — we detect that re-entry and delegate to the real Node listen to avoid "already listening".
  const server = fastify.server as Server;
  const originalListen = server.listen.bind(server);
  let listenReentry = false;

  function wrappedListen(
    this: Server,
    port?: number | ListenOptions,
    hostOrBacklogOrCb?: string | number | (() => void),
    cb?: () => void,
  ): Server {
    if (listenReentry) {
      listenReentry = false;
      return (originalListen as (...args: unknown[]) => Server).apply(
        this,
        arguments as unknown as unknown[],
      ) as Server;
    }
    const fastifyCb: ListenCallback = (err, address) => {
      if (err) {
        server.emit("error", err);
        if (userCb && userCb.length > 0) userCb(err, address);
        if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
          throw err;
        }
        return;
      }
      if (userCb) userCb(null, address);
    };
    let userCb: ListenCallback | undefined;
    if (typeof port === "object" && port !== null && "port" in port) {
      const opts = port as { port?: number; host?: string };
      userCb =
        typeof hostOrBacklogOrCb === "function"
          ? (hostOrBacklogOrCb as ListenCallback)
          : undefined;
      listenReentry = true;
      const host = opts.host ?? "0.0.0.0";
      try {
        if (userCb) fastify.listen({ port: opts.port ?? 0, host }, fastifyCb);
        else fastify.listen({ port: opts.port ?? 0, host });
      } catch (e) {
        listenReentry = false;
        throw e;
      }
      return this;
    }
    const options = listenArgsToOptions(
      typeof port === "number" ? port : 0,
      hostOrBacklogOrCb,
      cb,
    );
    userCb = options.cb;
    listenReentry = true;
    const host = options.host ?? "0.0.0.0";
    try {
      if (userCb) fastify.listen({ port: options.port, host }, fastifyCb);
      else fastify.listen({ port: options.port, host });
    } catch (e) {
      listenReentry = false;
      throw e;
    }
    return this;
  }

  // Node's listen has many overloads; our wrapper is compatible at runtime
  (server as { listen: typeof wrappedListen }).listen = wrappedListen;

  return fastify;
}
