/**
 * Unsafe middleware detection.
 * If unsure → Express lane. Never silently downgrade.
 */

import type { ExpressHandler } from '../types/express';

const UNSAFE_NAMES = new Set([
  'multer',
  'upload',
  'storage.upload',
  'formidable',
  'busboy',
  'multipart',
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
  const s = (fn as unknown as { name?: string }).name || '';
  const str = fn.toString();
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
