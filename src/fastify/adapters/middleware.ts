/**
 * (req, res, next) → async hook for Fastify preHandler.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ExpressRequest, ExpressResponse, NextFunction } from '../../types/express.js';
import { adaptRequest } from './request.js';
import { adaptResponse } from './response.js';

export type MiddlewareRunner = (
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction
) => void | Promise<void>;

export function toPreHandler(
  run: MiddlewareRunner,
  adaptReq: (r: FastifyRequest) => ExpressRequest,
  adaptRes: (reply: FastifyReply, req: FastifyRequest) => ExpressResponse
) {
  return async function preHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const req = adaptReq(request);
    const res = adaptRes(reply, request);
    await new Promise<void>((resolve, reject) => {
      const next: NextFunction = (err?: Error | unknown) => {
        if (err) reject(err);
        else resolve();
      };
      const result = run(req, res, next);
      const p = result as void | Promise<void>;
      if (p != null && typeof (p as Promise<unknown>).then === 'function') {
        (p as Promise<void>).then(() => resolve(), reject);
      } else {
        resolve();
      }
    });
  };
}
