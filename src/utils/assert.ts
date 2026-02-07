/**
 * Fail-fast helpers. No silent failures.
 */

const ROUTE_LOCKED_MSG = 'Cannot add routes or middleware after listen(). Routes are immutable.';
const ROUTER_NOT_SUPPORTED_MSG = 'express.Router() is not supported in v1. Fail loudly.';
const RES_LOCALS_MSG = 'res.locals is not supported in v1. Fail loudly.';

export function assertNotLocked(locked: boolean): void {
  if (locked) {
    throw new Error(ROUTE_LOCKED_MSG);
  }
}

export function assertNoRouter(fn: unknown): void {
  if (fn && typeof fn === 'object' && 'stack' in fn && Array.isArray((fn as { stack: unknown }).stack)) {
    throw new Error(ROUTER_NOT_SUPPORTED_MSG);
  }
}

export function assertNoResLocals(): void {
  // Called when we detect res.locals usage in middleware classification or at runtime
  throw new Error(RES_LOCALS_MSG);
}

export function failUnsupportedFeature(feature: string): never {
  throw new Error(`${feature} is not supported in v1. Fail loudly.`);
}
