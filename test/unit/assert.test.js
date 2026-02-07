/**
 * Unit tests: fail-fast assert (src/utils/assert.ts).
 * Run: node --test test/unit/assert.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

const { assertNotLocked, failUnsupportedFeature } = await import('../../dist/utils/assert.js');

describe('assertNotLocked', () => {
  it('does not throw when locked is false', () => {
    assert.doesNotThrow(() => assertNotLocked(false));
  });

  it('throws when locked is true', () => {
    assert.throws(
      () => assertNotLocked(true),
      /Cannot add routes or middleware after listen/
    );
  });
});

describe('failUnsupportedFeature', () => {
  it('throws with feature message', () => {
    assert.throws(
      () => failUnsupportedFeature('res.locals'),
      /res\.locals.*not supported/
    );
  });
});
