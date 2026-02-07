/**
 * Boot, lock, listen. Compile once; no dynamic routing.
 */

import Fastify from 'fastify';
import type { ExpressLikeApp } from '../types/internal.js';
import type { ExpressHandler } from '../types/express.js';
import { classifyAll } from '../app/classify.js';
import { createExpressEngine } from '../express/engine.js';
import { mountExpress } from '../express/mount.js';
import { registerCompiledRoutes } from '../fastify/register.js';
import { populateExpressApp } from './populateExpress.js';
import { assertNotLocked } from '../utils/assert.js';
import { RouteStore } from '../app/RouteStore.js';

export interface CreateAppOptions {
  /** If true, log compile and lane info (dev). */
  dev?: boolean;
}

export function createApp(_options?: CreateAppOptions): ExpressLikeApp {
  const routeStore = new RouteStore();
  const locked = { current: false };

  const app: ExpressLikeApp = {
    use(pathOrHandler: string | ExpressHandler, ...handlers: ExpressHandler[]) {
      assertNotLocked(locked.current);
      if (typeof pathOrHandler === 'function') {
        routeStore.addMiddleware('/', pathOrHandler, ...handlers);
      } else {
        routeStore.addMiddleware(pathOrHandler, ...handlers);
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
      port?: number | (() => void),
      host?: string | (() => void),
      callback?: () => void
    ): unknown {
      let cb: (() => void) | undefined;
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

      const fastify = Fastify({ logger: false });
      const classified = classifyAll(routeStore.getAll());
      const runMiddleware = (
        _req: import('../types/express.js').ExpressRequest,
        _res: import('../types/express.js').ExpressResponse,
        next: import('../types/express.js').NextFunction
      ) => next();
      registerCompiledRoutes(fastify, classified, runMiddleware);
      mountExpress(fastify, express);

      const listenOpts = { port: p ?? 0, host: h ?? '0.0.0.0' };
      const promise = fastify.listen(listenOpts, (err) => {
        if (err) throw err;
        cb?.();
      });
      // Return a thenable that resolves to { close } so tests can close the server
      return Promise.resolve(promise).then(() => ({
        close: () => fastify.close(),
      }));
    },
  };

  return app;
}
