/**
 * Boot, lock, listen. Compile once; no dynamic routing.
 */

import Fastify from 'fastify';
import type { ExpressLikeApp, ServerLike, UseHandler } from '../types/internal';
import type { ExpressHandler } from '../types/express';
import { classifyAll } from '../app/classify';
import { createExpressEngine } from '../express/engine';
import { mountExpress } from '../express/mount';
import { registerCompiledRoutes, installExpressJsonParser } from '../fastify/register';
import { populateExpressApp } from './populateExpress';
import { assertNotLocked } from '../utils/assert';
import { findErrorMiddleware, wrapErrorHandler } from './errorHandler';
import { createRequestAdapter } from '../fastify/adapters/request';
import { adaptResponse } from '../fastify/adapters/response';
import { RouteStore } from '../app/RouteStore';
import { isExpressRouter, flattenRouter } from '../app/flattenRouter';
import { normalizePath } from '../utils/path';
import { createRuntimeLogger } from '../utils/runtimeLogger';

export interface CreateAppOptions {
  /** If true, log compile and lane info (dev). Enables fallback warnings when downgrading to Express lane. */
  dev?: boolean;
}

export function createApp(options?: CreateAppOptions): ExpressLikeApp {
  const routeStore = new RouteStore();
  const locked = { current: false };
  const runtimeLogger = createRuntimeLogger(options);

  const app: ExpressLikeApp = {
    use(pathOrHandler: string | UseHandler, ...handlers: UseHandler[]) {
      assertNotLocked(locked.current);
      const path = typeof pathOrHandler === 'string' ? normalizePath(pathOrHandler) : '/';
      const allHandlers: UseHandler[] =
        typeof pathOrHandler === 'string' ? handlers : [pathOrHandler, ...handlers];

      let middlewareGroup: ExpressHandler[] = [];
      for (const h of allHandlers) {
        if (isExpressRouter(h)) {
          if (middlewareGroup.length > 0) {
            routeStore.addMiddleware(path, ...middlewareGroup);
            middlewareGroup = [];
          }
          const flat = flattenRouter(h, path);
          if (flat !== null) {
            routeStore.addEntries(flat);
          } else {
            runtimeLogger.warnDowngrade(
              'express.Router (middleware or RegExp path). Tip: import express-fastify-runtime before Express or routers so middleware paths can be detected'
            );
            routeStore.addMiddleware(path, h as ExpressHandler);
          }
        } else {
          middlewareGroup.push(h as ExpressHandler);
        }
      }
      if (middlewareGroup.length > 0) {
        routeStore.addMiddleware(path, ...middlewareGroup);
      }
      return app;
    },

    get(path: string, ...handlers: ExpressHandler[]) {
      assertNotLocked(locked.current);
      routeStore.addRoute('get', path, ...handlers);
      return app;
    },

    post(path: string, ...handlers: ExpressHandler[]) {
      assertNotLocked(locked.current);
      routeStore.addRoute('post', path, ...handlers);
      return app;
    },

    put(path: string, ...handlers: ExpressHandler[]) {
      assertNotLocked(locked.current);
      routeStore.addRoute('put', path, ...handlers);
      return app;
    },

    patch(path: string, ...handlers: ExpressHandler[]) {
      assertNotLocked(locked.current);
      routeStore.addRoute('patch', path, ...handlers);
      return app;
    },

    delete(path: string, ...handlers: ExpressHandler[]) {
      assertNotLocked(locked.current);
      routeStore.addRoute('delete', path, ...handlers);
      return app;
    },

    head(path: string, ...handlers: ExpressHandler[]) {
      assertNotLocked(locked.current);
      routeStore.addRoute('head', path, ...handlers);
      return app;
    },

    options(path: string, ...handlers: ExpressHandler[]) {
      assertNotLocked(locked.current);
      routeStore.addRoute('options', path, ...handlers);
      return app;
    },

    all(path: string, ...handlers: ExpressHandler[]) {
      assertNotLocked(locked.current);
      routeStore.addRoute('all', path, ...handlers);
      return app;
    },

    listen(
      port?: number | ((err?: Error) => void),
      host?: string | ((err?: Error) => void),
      callback?: (err?: Error) => void
    ): Promise<ServerLike> {
      let cb: ((err?: Error) => void) | undefined;
      let p: number | undefined;
      let h: string | undefined;
      if (typeof port === 'function') {
        cb = port;
        p = undefined;
        h = undefined;
      } else if (typeof host === 'function') {
        cb = host;
        p = port;
        h = undefined;
      } else {
        p = port;
        h = host;
        cb = callback;
      }

      locked.current = true;

      const express = createExpressEngine();
      populateExpressApp(express, routeStore);

      const fastify = Fastify({
  logger: false,
  bodyLimit: 10 * 1024 * 1024, // 10MB; matches express.json({ limit: '10mb' }) for large payloads
});
      installExpressJsonParser(fastify); // match express.json(): tolerate empty bodies (→ {})
      const classified = classifyAll(routeStore.getAll());
      const runMiddleware = (
        _req: import('../types/express').ExpressRequest,
        _res: import('../types/express').ExpressResponse,
        next: import('../types/express').NextFunction
      ) => next();
      registerCompiledRoutes(fastify, classified, runMiddleware);

      // Wire Express 4-arg error middleware → Fastify error handler so next(err)/throw on the
      // Fastify lane reaches it (parity with fast()). The error mw is excluded from the normal
      // middleware chain (see compile.ts), so it only runs here.
      const errorMiddleware = findErrorMiddleware(routeStore.getAll());
      if (errorMiddleware) {
        fastify.setErrorHandler(
          wrapErrorHandler(errorMiddleware, createRequestAdapter(), adaptResponse)
        );
      }

      mountExpress(fastify, express);

      const listenOpts = { port: p ?? 0, host: h ?? '0.0.0.0' };
      const listenPromise = fastify.listen(listenOpts);
      if (cb) {
        listenPromise.then(() => cb(), (err) => cb?.(err));
      }
      return listenPromise.then(
        (): ServerLike => ({
          close(closeCb?) {
            return fastify.close().then(() => closeCb?.(), (err) => closeCb?.(err));
          },
          address() {
            return fastify.server?.address() ?? null;
          },
        })
      );
    },
  };

  return app;
}
