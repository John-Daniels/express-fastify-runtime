/**
 * Unit tests: path normalization (src/utils/path.ts).
 * Run: node --test test/unit/path.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// Use built dist (ESM)
const { normalizePath, joinPath } = await import('../../dist/utils/path.js');

describe('normalizePath', () => {
  it('returns "/" for empty or "/"', () => {
    assert.strictEqual(normalizePath(''), '/');
    assert.strictEqual(normalizePath('/'), '/');
  });

  it('collapses multiple slashes and trims trailing', () => {
    assert.strictEqual(normalizePath('/api//users/'), '/api/users');
    assert.strictEqual(normalizePath('foo/bar'), '/foo/bar');
  });
});

describe('joinPath', () => {
  it('joins prefix and path', () => {
    assert.strictEqual(joinPath('/api', '/users'), '/api/users');
    assert.strictEqual(joinPath('/', '/users'), '/users');
    assert.strictEqual(joinPath('/api', '/'), '/api');
  });
});
