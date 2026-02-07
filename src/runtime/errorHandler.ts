/**
 * Express-style error bridge. Global error middleware → Fastify error handler.
 */

import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import type { ExpressRequest, ExpressResponse, ExpressErrorMiddleware } from '../types/express.js';

export function wrapErrorHandler(
  errorMiddleware: ExpressErrorMiddleware,
  adaptRequest: (r: FastifyRequest) => ExpressRequest,
  adaptResponse: (r: FastifyReply, req: FastifyRequest) => ExpressResponse
) {
  return async (err: FastifyError, request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const req = adaptRequest(request);
    const res = adaptResponse(reply, request);
    await new Promise<void>((resolve, reject) => {
      const next = (e?: Error | unknown) => {
        if (e) reject(e);
        else resolve();
      };
      const result = errorMiddleware(err as Error, req, res, next);
      const p = result as void | Promise<void>;
      if (p != null && typeof (p as Promise<unknown>).then === 'function') {
        (p as Promise<void>).then(() => resolve(), reject);
      } else {
        resolve();
      }
    });
  };
}
