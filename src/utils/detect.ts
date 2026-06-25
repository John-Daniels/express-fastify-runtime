/**
 * Unsafe middleware detection.
 * If unsure → Express lane. Never silently downgrade.
 */

import type { ExpressHandler } from '../types/express';
import { unwrapHandler } from './unwrap';

const UNSAFE_NAMES = new Set([
  'multer',
  'upload',
  'storage.upload',
  'formidable',
  'busboy',
  'multipart',
  // Express body parsers that read the raw request stream. On the Fastify lane the body stream
  // is already consumed and there is no parser for these content types, so they must run on the
  // Express lane. NOTE: express.json()'s `jsonParser` is intentionally NOT here — it is mapped to
  // Fastify's native JSON parser (see express/middleware.ts) and stays on the fast lane.
  'urlencodedparser', // express.urlencoded()
  'rawparser', // express.raw()
  'textparser', // express.text()
]);

const UNSAFE_PATTERNS = [
  /\.pipe\s*\(/,
  /req\.on\s*\(\s*['"]data['"]/,
  /req\.on\s*\(\s*['"]end['"]/,
  /multipart\/form-data/,
  /formidable|busboy|multer/,
];

/**
 * Returns true if the middleware is known to require Express (streams, multipart, etc.).
 */
export function isExpressRequired(fn: ExpressHandler): boolean {
  if (typeof fn !== 'function') return true;
  // Unwrap APM wrappers (OpenTelemetry/Sentry) so body parsers/multer/etc. are recognized even
  // when an instrumentation library has wrapped them (otherwise fn.name is e.g. "patched").
  const target = unwrapHandler(fn) as ExpressHandler;
  if (typeof target !== 'function') return true;
  const s = (target as unknown as { name?: string }).name || '';
  const str = target.toString();
  const nameLower = s.toLowerCase();
  if (UNSAFE_NAMES.has(nameLower)) return true;
  for (const name of UNSAFE_NAMES) {
    if (nameLower.includes(name) || str.includes(name)) return true;
  }
  for (const re of UNSAFE_PATTERNS) {
    if (re.test(str)) return true;
  }
  return false;
}

/**
 * Returns true if the middleware is safe to run in Fastify (no streams, no prototype mutation).
 */
export function isFastifySafe(fn: ExpressHandler): boolean {
  return !isExpressRequired(fn);
}
