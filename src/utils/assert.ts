/**
 * Fail-fast helpers. No silent failures.
 */

const ROUTE_LOCKED_MSG = 'Cannot add routes or middleware after listen(). Routes are immutable.';

export function assertNotLocked(locked: boolean): void {
  if (locked) {
    throw new Error(ROUTE_LOCKED_MSG);
  }
}

export function failUnsupportedFeature(feature: string): never {
  throw new Error(`${feature} is not supported. Fail loudly.`);
}
