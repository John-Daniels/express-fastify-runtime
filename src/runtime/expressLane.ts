/**
 * Explicit "Express lane" marker: routes or handlers wrapped with expressLane(fn)
 * or decorated with @ExpressLane() are not compiled to the Fastify lane and
 * always run on the Express lane (notFoundHandler → real Express app).
 *
 * Use when a handler needs Express-only APIs (e.g. res.render, res.sendFile)
 * so you don't have to rely on RegExp paths.
 */

import type { ExpressMiddleware, ExpressErrorMiddleware } from '../types/express.js';

/** Symbol attached to handlers that must run on the Express lane. */
export const EXPRESS_LANE = Symbol.for('express-fastify-runtime.expressLane');

/** Check if a handler was marked for the Express lane. */
export function isExpressLaneHandler(fn: unknown): boolean {
  return typeof fn === 'function' && (fn as unknown as Record<symbol, boolean>)[EXPRESS_LANE] === true;
}

/**
 * Wrap a handler so it runs on the Express lane only (not compiled to Fastify).
 * Use for routes that need res.render, res.sendFile, app.set('view engine'), etc.
 *
 * @example
 *   app.get('/page', expressLane((req, res) => res.render('index', { title: 'Hello' })));
 */
export function expressLane<T extends ExpressMiddleware | ExpressErrorMiddleware>(fn: T): T {
  const wrapped = function (this: unknown, ...args: unknown[]) {
    return (fn as (...a: unknown[]) => unknown).apply(this, args);
  };
  Object.defineProperty(wrapped, EXPRESS_LANE, { value: true, enumerable: false });
  return wrapped as T;
}

/**
 * Class method decorator: mark the handler to run on the Express lane only.
 * Requires "experimentalDecorators": true (and optionally "emitDecoratorMetadata") in tsconfig.
 *
 * @example
 *   class PageController {
 *     @ExpressLane()
 *     page(req: Request, res: Response) {
 *       res.render('index', { title: 'Hello' });
 *     }
 *   }
 *   app.get('/page', (req, res, next) => new PageController().page(req, res, next));
 *   // or: app.get('/page', controller.page.bind(controller));
 */
export function ExpressLane() {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const fn = descriptor.value;
    if (typeof fn !== 'function') return descriptor;
    const wrapped = function (this: unknown, ...args: unknown[]) {
      return fn.apply(this, args);
    };
    Object.defineProperty(wrapped, EXPRESS_LANE, { value: true, enumerable: false });
    descriptor.value = wrapped;
    return descriptor;
  };
}
