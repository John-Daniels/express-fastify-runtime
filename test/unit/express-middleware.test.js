/**
 * Unit tests: express.json() detection (Express 4 + 5).
 * Run: node --test test/unit/express-middleware.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import express from 'express';

const { isExpressJson, expressJsonPassthrough } = await import('../../dist/express/middleware.js');

describe('isExpressJson', () => {
  it('detects express.json() (Express 5 jsonParser)', () => {
    const fn = express.json();
    assert.strictEqual(isExpressJson(fn), true, 'express.json() must be detected for passthrough');
  });

  it('returns false for plain middleware', () => {
    const mw = (req, res, next) => next();
    assert.strictEqual(isExpressJson(mw), false);
  });

  it('returns false for non-function', () => {
    assert.strictEqual(isExpressJson(null), false);
    assert.strictEqual(isExpressJson(undefined), false);
  });
});

describe('expressJsonPassthrough', () => {
  it('calls next() and does not parse body', () => {
    const passthrough = expressJsonPassthrough();
    let nextCalled = false;
    passthrough({}, {}, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });
});
