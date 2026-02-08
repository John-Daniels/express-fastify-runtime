/**
 * Boot, lock, listen. Compile once; no dynamic routing.
 */

import Fastify from 'fastify';
import type { ExpressLikeApp, ServerLike } from '../types/internal.js';
import type { ExpressHandler } from '../types/express.js';
import { classifyAll } from '../app/classify.js';
import { createExpressEngine } from '../express/engine.js';
import { mountExpress } from '../express/mount.js';
import { registerCompiledRoutes } from '../fastify/register.js';
import { populateExpressApp } from './populateExpress.js';
import { assertNotLocked } from '../utils/assert.js';
import { RouteStore } from '../app/RouteStore.js';
import { isExpressRouter, flattenRouter } from '../app/flattenRouter.js';
import { normalizePath } from '../utils/path.js';
import { createRuntimeLogger } from '../utils/runtimeLogger.js';

export interface CreateAppOptions {
  /** If true, log compile and lane info (dev). Enables fallback warnings when downgrading to Express lane. */
  dev?: boolean;
}

export function createApp(options?: CreateAppOptions): ExpressLikeApp {
  const routeStore = new RouteStore();
  const locked = { current: false };
  const runtimeLogger = createRuntimeLogger(options);

  const app: ExpressLikeApp = {
    use(pathOrHandler: string | ExpressHandler, ...handlers: ExpressHandler[]) {
      assertNotLocked(locked.current);
      const path = typeof pathOrHandler === 'string' ? normalizePath(pathOrHandler) : '/';
      const allHandlers: ExpressHandler[] =
        typeof pathOrHandler === 'function' ? [pathOrHandler, ...handlers] : handlers;

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
            runtimeLogger.warnDowngrade('express.Router (middleware or RegExp path)');
            routeStore.addMiddleware(path, h as ExpressHandler);
          }
        } else {
          middlewareGroup.push(h);
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
      const classified = classifyAll(routeStore.getAll());
      const runMiddleware = (
        _req: import('../types/express.js').ExpressRequest,
        _res: import('../types/express.js').ExpressResponse,
        next: import('../types/express.js').NextFunction
      ) => next();
      registerCompiledRoutes(fastify, classified, runMiddleware);
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
