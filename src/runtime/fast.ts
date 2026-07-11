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
import { classifyAll } from "../app/classify";
import {
  introspectExpressApp,
  getAllExpressErrorMiddleware,
  getAppParamNames,
  type ExpressAppLike,
} from "../app/introspectExpress";
import { deriveRoutingOptions } from "./routingOptions";
import { mountExpress } from "../express/mount";
import { createRequestAdapter } from "../fastify/adapters/request";
import { createResponseAdapter } from "../fastify/adapters/response";
import { registerCompiledRoutes, installExpressJsonParser } from "../fastify/register";
import { wrapErrorHandler } from "./errorHandler";
import type {
  ExpressRequest,
  ExpressResponse,
  NextFunction,
} from "../types/express";

// Types for the server.listen wrapper (readable names, no inline imports)
type ListenCallback = (err: Error | null, address: string) => void;
interface ListenOptionsResult {
  port: number;
  host?: string;
  cb?: ListenCallback;
}

/** Experimental options. May change or be removed. */
export interface FastOpsExperimental {
  /** When true, log each request with which lane handled it (Fastify vs Express). */
  diagnostics?: boolean;
}

/** Options for fast(app, ops). More keys can be added later. */
export interface FastOps {
  fastify?: FastifyServerOptions;
  /** Experimental options (e.g. diagnostics logging). */
  experimental?: FastOpsExperimental;
}

/**
 * The Express application accepted by fast().
 *
 * Typed structurally (a request-handler function that also exposes Express's methods) rather than
 * importing `Application` from `@types/express`. This decouples fast()'s public signature from any
 * specific Express / @types/express version, so `fast(express())` type-checks whether the host
 * project is on Express 4 or 5 — avoiding the "'Express' is not assignable to 'Application'" error
 * that appears when the host's @types/express differs from the one this package was built with.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ExpressApp = ((...args: any[]) => any) & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  use: (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

const DEFAULT_OPTS: FastifyServerOptions = {
  logger: false,
  bodyLimit: 10 * 1024 * 1024, // 10MB; matches express.json({ limit: '10mb' })
};

/**
 * Coerce a port to a number like Node/Express do. `process.env.PORT` is a STRING, so
 * server.listen(process.env.PORT) passes "2015"; without coercion we'd fall back to 0 (a random
 * port) and the server would be "running" but unreachable on the intended port. Invalid/empty
 * values fall back to 0 (OS-assigned), matching server.listen() with no port.
 */
function toPort(port?: number | string): number {
  if (typeof port === "number" && Number.isFinite(port)) return port;
  if (typeof port === "string" && port.trim() !== "") {
    const n = Number(port);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function listenArgsToOptions(
  port?: number | string,
  hostOrBacklogOrCb?: string | number | (() => void),
  cb?: () => void,
): ListenOptionsResult {
  const options: ListenOptionsResult = {
    port: toPort(port),
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
  app: ExpressApp,
  ops?: FastOps | FastifyServerOptions,
): FastifyInstance {
  const fastifyOpts =
    ops && "fastify" in ops
      ? ops.fastify
      : (ops as FastifyServerOptions | undefined);
  // Match the wrapped app's Express routing semantics (case-insensitive + non-strict by default);
  // user-supplied fastify options still win.
  const routingOpts = deriveRoutingOptions(app);
  const fastify = Fastify({ ...DEFAULT_OPTS, routerOptions: routingOpts, ...fastifyOpts });
  installExpressJsonParser(fastify); // match express.json(): tolerate empty bodies (→ {})

  const diagnostics =
    ops && "experimental" in ops && ops.experimental?.diagnostics === true;

  const entries = introspectExpressApp(app as unknown as ExpressAppLike);
  if (entries !== null && entries.length > 0) {
    const classified = classifyAll(entries);
    const noop: (
      req: ExpressRequest,
      res: ExpressResponse,
      next: NextFunction,
    ) => void = (_req, _res, next) => next();
    const paramNames = getAppParamNames(app as unknown as ExpressAppLike);
    registerCompiledRoutes(fastify, classified, noop, { diagnostics, paramNames });
  } else if (diagnostics) {
    console.log(
      "[express-fastify-runtime] No routes compiled to Fastify lane (all requests will use Express lane). See https://github.com/John-Daniels/express-fastify-runtime/blob/main/docs/FAST_PRODUCTION_CHECKLIST.md (§ Why is everything on the Express lane?)",
    );
  }

  mountExpress(fastify, app as unknown as Application, { diagnostics });

  const expressErrorMiddlewares = getAllExpressErrorMiddleware(
    app as unknown as ExpressAppLike,
  );
  if (expressErrorMiddlewares.length > 0) {
    const adaptRequest = createRequestAdapter();
    const adaptResponse = createResponseAdapter();
    fastify.setErrorHandler(
      wrapErrorHandler(
        expressErrorMiddlewares,
        adaptRequest,
        adaptResponse,
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
    port?: number | string | ListenOptions,
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
      const opts = port as { port?: number | string; host?: string };
      userCb =
        typeof hostOrBacklogOrCb === "function"
          ? (hostOrBacklogOrCb as ListenCallback)
          : undefined;
      listenReentry = true;
      const host = opts.host ?? "0.0.0.0";
      const p = toPort(opts.port);
      try {
        if (userCb) fastify.listen({ port: p, host }, fastifyCb);
        else fastify.listen({ port: p, host });
      } catch (e) {
        listenReentry = false;
        throw e;
      }
      return this;
    }
    const options = listenArgsToOptions(
      port as number | string | undefined,
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
