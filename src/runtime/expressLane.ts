/**
 * Explicit "Express lane" marker: routes or handlers wrapped with expressLane(fn)
 * or decorated with @ExpressLane() are not compiled to the Fastify lane and
 * always run on the Express lane (notFoundHandler → real Express app).
 *
 * Use when a handler needs Express-only APIs (e.g. res.render, res.sendFile)
 * so you don't have to rely on RegExp paths.
 */

import type { ExpressMiddleware, ExpressErrorMiddleware } from '../types/express';

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

function wrapForExpressLane(fn: (...args: unknown[]) => unknown): (...args: unknown[]) => unknown {
  const wrapped = function (this: unknown, ...args: unknown[]) {
    return fn.apply(this, args);
  };
  Object.defineProperty(wrapped, EXPRESS_LANE, { value: true, enumerable: false });
  return wrapped;
}

/**
 * Class method decorator: mark the handler to run on the Express lane only.
 * Use as @ExpressLane or @ExpressLane() (both work).
 * Requires "experimentalDecorators": true (and optionally "emitDecoratorMetadata") in tsconfig.
 *
 * Note: Decorators are only valid on class members. For standalone functions, use
 * expressLane(fn) when registering the route: router.get('/path', expressLane(myHandler)).
 *
 * @example
 *   class PageController {
 *     @ExpressLane
 *     page(req: Request, res: Response) {
 *       res.render('index', { title: 'Hello' });
 *     }
 *   }
 *   app.get('/page', (req, res, next) => new PageController().page(req, res, next));
 */
export function ExpressLane(
  targetOrNil?: unknown,
  propertyKeyOrNil?: string,
  descriptorOrNil?: PropertyDescriptor
): PropertyDescriptor | ((_t: unknown, _k: string, d: PropertyDescriptor) => PropertyDescriptor) {
  if (descriptorOrNil !== undefined && typeof descriptorOrNil.value === 'function') {
    descriptorOrNil.value = wrapForExpressLane(descriptorOrNil.value as (...args: unknown[]) => unknown);
    return descriptorOrNil;
  }
  return function (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor {
    if (typeof descriptor.value === 'function') {
      descriptor.value = wrapForExpressLane(descriptor.value as (...args: unknown[]) => unknown);
    }
    return descriptor;
  };
}
