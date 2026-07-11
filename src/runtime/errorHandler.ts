/**
 * Express-style error bridge. Runs the app's error-middleware CHAIN → Fastify error handler.
 *
 * Express runs error middlewares as a chain: each either responds, or calls next(err) to pass the
 * error to the NEXT error middleware. A common enterprise setup registers an APM/logger error
 * handler (e.g. Sentry.setupExpressErrorHandler) BEFORE the real handler that maps status codes; the
 * first one captures the error and defers via next(err). So we must run the whole chain — stopping
 * at the first (and treating its next(err) as failure) turns every error into a generic 500.
 */

import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import type { ExpressRequest, ExpressResponse, ExpressErrorMiddleware } from '../types/express';
import type { RouteEntry } from '../types/internal';

/**
 * Find ALL Express 4-arg error middlewares among route-store entries (for createApp()), in order.
 * Mirrors getAllExpressErrorMiddleware() which does the same for an introspected Express app.
 */
export function findAllErrorMiddleware(entries: readonly RouteEntry[]): ExpressErrorMiddleware[] {
  const out: ExpressErrorMiddleware[] = [];
  for (const e of entries) {
    if (e.type !== 'middleware') continue;
    for (const h of e.handlers) {
      if (typeof h === 'function' && (h as { length: number }).length === 4) {
        out.push(h as unknown as ExpressErrorMiddleware);
      }
    }
  }
  return out;
}

/** First error middleware only (kept for back-compat). */
export function findErrorMiddleware(entries: readonly RouteEntry[]): ExpressErrorMiddleware | null {
  return findAllErrorMiddleware(entries)[0] ?? null;
}

/** Status to fall back to when the chain never responds — prefer the error's own status. */
function errorStatus(err: unknown): number {
  const e = err as { statusCode?: unknown; status?: unknown } | null;
  const code = e?.statusCode ?? e?.status;
  return typeof code === 'number' && code >= 400 && code <= 599 ? code : 500;
}

/**
 * Wrap the Express error-middleware chain as a Fastify error handler. Runs each middleware in order;
 * a middleware that responds ends the chain, one that calls next(err) advances to the next carrying
 * the (possibly new) error, and an exhausted chain falls back to the error's own status.
 */
export function wrapErrorHandler(
  errorMiddlewares: ExpressErrorMiddleware[],
  adaptRequest: (r: FastifyRequest) => ExpressRequest,
  adaptResponse: (r: FastifyReply, req: FastifyRequest) => ExpressResponse,
) {
  return async (err: FastifyError, request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const req = adaptRequest(request);
    const res = adaptResponse(reply, request);
    let currentErr: unknown = err;

    for (const mw of errorMiddlewares) {
      if (reply.sent || reply.raw.headersSent) return; // a previous handler already responded

      // Run one error middleware. It resolves the promise when it either responds (no next) or calls
      // next(): next(e) → deferred = { err: e }, next() → deferred = null (defer with same behavior).
      let deferred: { err: unknown } | 'passthrough' | null = null;
      let advanced = false;
      try {
        await new Promise<void>((resolve, reject) => {
          const next = (e?: unknown) => {
            if (advanced) return;
            advanced = true;
            deferred = e !== undefined && e !== null ? { err: e } : 'passthrough';
            resolve();
          };
          let ret: unknown;
          try {
            ret = mw(currentErr as Error, req, res, next);
          } catch (thrown) {
            return reject(thrown);
          }
          if (ret != null && typeof (ret as Promise<unknown>).then === 'function') {
            (ret as Promise<void>).then(() => resolve(), reject);
          } else if (!advanced) {
            // Sync middleware that responded (or did nothing) without calling next.
            resolve();
          }
        });
      } catch (thrown) {
        // The middleware itself threw — treat as the new error and continue the chain.
        currentErr = thrown;
        continue;
      }

      if (reply.sent || reply.raw.headersSent) return; // this middleware responded → done
      if (deferred === null) return; // responded without next and without sending? nothing more to do
      if (deferred === 'passthrough') continue; // next() with no error → try the next handler
      currentErr = (deferred as { err: unknown }).err; // next(err) → carry it forward
    }

    // Chain exhausted with no response: send a sane fallback using the error's own status.
    if (!reply.sent && !reply.raw.headersSent) {
      reply.code(errorStatus(currentErr)).send({ error: (currentErr as Error)?.message ?? 'Internal Server Error' });
    }
  };
}
