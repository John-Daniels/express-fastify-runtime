/**
 * Unit tests: middleware safety detection (src/utils/detect.ts).
 * Run: node --test test/unit/detect.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

const { isExpressRequired, isFastifySafe } = await import('../../dist/utils/detect.js');

describe('isExpressRequired', () => {
  it('returns true for function named multer or upload', () => {
    function multer() {}
    assert.strictEqual(isExpressRequired(multer), true);
    function upload() {}
    assert.strictEqual(isExpressRequired(upload), true);
  });

  it('returns false for plain middleware', () => {
    const mw = (req, res, next) => next();
    assert.strictEqual(isExpressRequired(mw), false);
  });

  it('returns true when source contains req.pipe', () => {
    const fn = new Function('req', 'res', 'next', 'req.pipe(res); next();');
    assert.strictEqual(isExpressRequired(fn), true);
  });
});

describe('isFastifySafe', () => {
  it('is opposite of isExpressRequired for plain middleware', () => {
    const mw = (req, res, next) => next();
    assert.strictEqual(isFastifySafe(mw), true);
    assert.strictEqual(isFastifySafe(mw), !isExpressRequired(mw));
  });
});
