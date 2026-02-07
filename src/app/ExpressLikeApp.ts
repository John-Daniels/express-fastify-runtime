/**
 * Express-like app: app.use, app.get, app.listen.
 * Routes are immutable after listen().
 */

import type { ExpressHandler } from '../types/express.js';
import type { ExpressLikeApp as IExpressLikeApp } from '../types/internal.js';
import { assertNotLocked } from '../utils/assert.js';

export function createExpressLikeApp(routeStore: import('./RouteStore.js').RouteStore, locked: { current: boolean }) {
  const app: IExpressLikeApp = {
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
      _port?: number | (() => void),
      _host?: string | (() => void),
      _callback?: () => void
    ): unknown {
      // Actual implementation is in lifecycle.ts which has access to Fastify/Express
      throw new Error('Use createApp() from the main entry; listen() is implemented there.');
    },
  };

  return app;
}
