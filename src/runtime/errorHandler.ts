/**
 * Express-style error bridge. Global error middleware → Fastify error handler.
 */

import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import type { ExpressRequest, ExpressResponse, ExpressErrorMiddleware } from '../types/express.js';

/** Build a minimal Express-like res for the error handler so status/json/setHeader always work. */
function errorHandlerRes(reply: FastifyReply): ExpressResponse {
  const res = {
    status(code: number) {
      reply.raw.statusCode = code;
      return res;
    },
    send(body?: unknown) {
      if (body !== undefined) reply.send(body);
      else reply.raw.end();
      return res;
    },
    json(body?: unknown) {
      reply.type('application/json').send(body);
      return res;
    },
    set(field: string | Record<string, string>, value?: string) {
      const raw = reply.raw;
      if (typeof field === 'string') raw.setHeader(field, value!);
      else for (const [k, v] of Object.entries(field)) raw.setHeader(k, v);
      return res;
    },
    setHeader(name: string, value: string | number | string[]) {
      reply.raw.setHeader(name, value as string);
      return res;
    },
  };
  return res as ExpressResponse;
}

export function wrapErrorHandler(
  errorMiddleware: ExpressErrorMiddleware,
  adaptRequest: (r: FastifyRequest) => ExpressRequest,
  _adaptResponse: (r: FastifyReply, req: FastifyRequest) => ExpressResponse
) {
  return async (err: FastifyError, request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const originalErr = err;
    const req = adaptRequest(request);
    const res = errorHandlerRes(reply);
    try {
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
    } catch (_e) {
      if (!reply.sent) {
        reply.code(500).send({ error: (originalErr as Error).message });
      }
      // Do not rethrow: client already got the intended response; rethrowing would trigger
      // Fastify to call us again with the thrown error (e.g. TypeError) and send that to the client.
    }
  };
}
