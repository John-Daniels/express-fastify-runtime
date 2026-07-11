/**
 * Explicit "Express lane" marker: routes or handlers wrapped with expressLane(fn)
 * or decorated with @ExpressLane() are not compiled to the Fastify lane and
 * always run on the Express lane (notFoundHandler → real Express app).
 *
 * Use when a handler needs Express-only APIs (e.g. res.render, res.sendFile)
 * so you don't have to rely on RegExp paths.
 */

import { unwrapHandler } from '../utils/unwrap';

/** Symbol attached to handlers that must run on the Express lane. */
export const EXPRESS_LANE = Symbol.for('express-fastify-runtime.expressLane');

function hasMarker(fn: unknown): boolean {
  return typeof fn === 'function' && (fn as unknown as Record<symbol, boolean>)[EXPRESS_LANE] === true;
}

/**
 * Check if a handler was marked for the Express lane. Also checks the unwrapped handler: APM/
 * instrumentation (Sentry/OpenTelemetry) wraps route handlers, and the marker (a non-enumerable
 * symbol) lives on the original fn, not the wrapper — unwrapHandler follows the `__original` chain
 * so expressLane still forces the Express lane under instrumentation.
 */
export function isExpressLaneHandler(fn: unknown): boolean {
  if (hasMarker(fn)) return true;
  if (typeof fn !== 'function') return false;
  const unwrapped = unwrapHandler(fn as (...a: unknown[]) => unknown);
  return unwrapped !== fn && hasMarker(unwrapped);
}

/**
 * Wrap a handler so it runs on the Express lane only (not compiled to Fastify).
 * Use for routes that need res.render, res.sendFile, app.set('view engine'), etc.
 *
 * @example
 *   app.get('/page', expressLane((req, res) => res.render('index', { title: 'Hello' })));
 */
// Pure pass-through marker: preserves the caller's exact handler type so
// `router.post('/x', expressLane(handler))` type-checks against @types/express (Express 4 or 5).
export function expressLane<T extends (...args: any[]) => any>(fn: T): T {
  const wrapped = function (this: unknown, ...args: unknown[]) {
    return (fn as (...a: unknown[]) => unknown).apply(this, args);
  };
  Object.defineProperty(wrapped, EXPRESS_LANE, { value: true, enumerable: false });
  return wrapped as unknown as T;
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
