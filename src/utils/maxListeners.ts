/**
 * Max listeners for request/response and socket.
 *
 * Node's default EventEmitter max listeners is 10. In a plain Express or
 * Fastify app that's usually fine, and neither framework changes it.
 *
 * In express-fastify-runtime we run **Express-style middleware on top of
 * Fastify's request/reply**, so a single response/socket can legitimately have
 * many listeners (our finish waiter, morgan, user middleware, etc.).
 *
 * Rather than trying to guess a safe upper bound (we already saw 32 was not
 * enough under load), we set the limit to **Infinity (unlimited)** for the
 * specific response/socket objects we control so Node does not emit
 * MaxListenersExceededWarning for this intentional pattern.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

/** Default max listeners per response and per socket (Infinity = unlimited). */
export const DEFAULT_MAX_LISTENERS = Infinity;

/**
 * Raise (or remove) the max-listener limit on the raw response and the
 * request's socket so multiple listeners (our finish waiter, morgan, user
 * middleware, etc.) do not trigger MaxListenersExceededWarning.
 *
 * Call at the start of each request (Fastify preHandler or Express lane
 * notFoundHandler).
 */
export function applyMaxListeners(
  rawReq: IncomingMessage,
  rawRes: ServerResponse,
  limit: number = DEFAULT_MAX_LISTENERS,
): void {
  if (typeof rawRes.setMaxListeners === "function") {
    rawRes.setMaxListeners(
      limit === Infinity ? Infinity : Math.max(rawRes.getMaxListeners?.() ?? 10, limit),
    );
  }
  const socket = rawReq?.socket;
  if (socket && typeof socket.setMaxListeners === "function") {
    socket.setMaxListeners(
      limit === Infinity ? Infinity : Math.max(socket.getMaxListeners?.() ?? 10, limit),
    );
  }
}
