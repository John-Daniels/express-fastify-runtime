/**
 * Translate an Express route path string into a Fastify (find-my-way) path.
 *
 * Express and Fastify share `/:param` and `/static`, but wildcards differ:
 *   - Express 4: bare `*` → the match is exposed as `req.params[0]` (then `[1]`, ...).
 *   - Express 5: named `*splat` → exposed as `req.params.splat`.
 *   - Fastify/find-my-way: a single trailing `*`, exposed as `req.params['*']`.
 * Passing an Express path verbatim to Fastify therefore (a) crashes at registration for Express 5's
 * `*splat` ("Wildcard must be the last character"), and (b) loses the wildcard value (handlers read
 * `params[0]`/`params.splat`, Fastify wrote `params['*']`).
 *
 * `toFastifyPath` rewrites a trailing wildcard to Fastify's `*` and reports the Express key to bridge
 * back at request time. Anything we can't translate safely (mid-path or multiple wildcards) returns
 * null so the caller leaves that route on the Express lane. Plain param/static paths are returned
 * unchanged with `wildcard: null` (zero behavior change for the common case).
 */

export interface FastifyPath {
  /** The path to register on Fastify. */
  url: string;
  /** Express params key to copy Fastify's `params['*']` into, or null when there is no wildcard. */
  wildcard: string | null;
}

const STAR = '*';

export function toFastifyPath(expressPath: string): FastifyPath | null {
  if (typeof expressPath !== 'string' || expressPath.length === 0) return null;

  // No wildcard → identical syntax on both routers (params, statics). Return as-is.
  if (!expressPath.includes(STAR)) return { url: expressPath, wildcard: null };

  // Count wildcard occurrences. Fastify supports exactly one, and only as the final segment.
  const starCount = (expressPath.match(/\*/g) ?? []).length;
  if (starCount !== 1) return null; // multiple wildcards → Express lane

  const starIndex = expressPath.indexOf(STAR);
  // Express 5 names the wildcard: `*name` (chars right after `*`). Express 4 uses a bare `*`.
  const after = expressPath.slice(starIndex + 1);
  const nameMatch = after.match(/^([A-Za-z_$][\w$]*)/);
  const wildcardName = nameMatch ? nameMatch[1] : null;
  const trailingAfterName = nameMatch ? after.slice(nameMatch[1].length) : after;

  // The wildcard must be last (only an optional trailing slash may follow). Otherwise we can't map
  // it to Fastify's trailing `*`.
  if (trailingAfterName !== '' && trailingAfterName !== '/') return null;

  const before = expressPath.slice(0, starIndex); // includes the slash before `*`
  const url = before + STAR;
  // Express 4 exposes a bare `*` as the numeric key '0'; Express 5 uses the given name.
  const wildcard = wildcardName ?? '0';
  return { url, wildcard };
}
