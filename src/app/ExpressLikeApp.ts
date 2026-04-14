/**
 * Express-like app stub: app.use, app.get, app.listen.
 * Routes are immutable after listen(). Full Router handling is in lifecycle.ts.
 */

import type { ExpressHandler } from '../types/express';
import type { ExpressLikeApp as IExpressLikeApp, ServerLike, UseHandler } from '../types/internal';
import { assertNotLocked } from '../utils/assert';

export function createExpressLikeApp(routeStore: import('./RouteStore').RouteStore, locked: { current: boolean }) {
  const app: IExpressLikeApp = {
    use(pathOrHandler: string | UseHandler, ...handlers: UseHandler[]) {
      assertNotLocked(locked.current);
      const path = typeof pathOrHandler === 'string' ? pathOrHandler : '/';
      const allHandlers: UseHandler[] =
        typeof pathOrHandler === 'string' ? handlers : [pathOrHandler, ...handlers];
      routeStore.addMiddleware(path, ...(allHandlers as ExpressHandler[]));
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
      _port?: number | ((err?: Error) => void),
      _host?: string | ((err?: Error) => void),
      _callback?: (err?: Error) => void
    ): Promise<ServerLike> {
      throw new Error('Use createApp() from the main entry; listen() is implemented there.');
    },
  };

  return app;
}
