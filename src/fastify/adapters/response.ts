/**
 * FastifyReply → Express-like res.
 * Reusable: one object per adapter, mutated per request (zero alloc hot path).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ExpressResponse } from '../../types/express.js';

export function adaptResponse(fastifyReply: FastifyReply, _fastifyReq: FastifyRequest): ExpressResponse {
  const raw = fastifyReply.raw;
  const res = Object.create(raw) as ExpressResponse;
  let statusCode = 200;

  res.status = function (code: number) {
    statusCode = code;
    raw.statusCode = code;
    return res;
  };

  res.send = function (body?: unknown) {
    if (body === undefined) {
      raw.end();
      return res;
    }
    if (typeof body === 'object' && body !== null && !Buffer.isBuffer(body)) {
      fastifyReply.type('application/json').send(body);
      return res;
    }
    fastifyReply.send(body);
    return res;
  };

  res.json = function (body?: unknown) {
    fastifyReply.type('application/json').send(body);
    return res;
  };

  res.set = function (field: string | Record<string, string>, value?: string) {
    if (typeof field === 'string') {
      raw.setHeader(field, value!);
    } else {
      for (const [k, v] of Object.entries(field)) {
        raw.setHeader(k, v);
      }
    }
    return res;
  };

  return res;
}

/** Creates a reusable response adapter: one res object, mutated per request. */
export function createResponseAdapter(): (fastifyReply: FastifyReply, fastifyReq: FastifyRequest) => ExpressResponse {
  const res = {
    _reply: null as FastifyReply | null,
    status(code: number) {
      this._reply!.raw.statusCode = code;
      return this as unknown as ExpressResponse;
    },
    send(body?: unknown) {
      const r = this._reply!;
      if (body === undefined) {
        r.raw.end();
        return this as unknown as ExpressResponse;
      }
      if (typeof body === 'object' && body !== null && !Buffer.isBuffer(body)) {
        r.type('application/json').send(body);
        return this as unknown as ExpressResponse;
      }
      r.send(body);
      return this as unknown as ExpressResponse;
    },
    json(body?: unknown) {
      this._reply!.type('application/json').send(body);
      return this as unknown as ExpressResponse;
    },
    set(field: string | Record<string, string>, value?: string) {
      const raw = this._reply!.raw;
      if (typeof field === 'string') {
        raw.setHeader(field, value!);
      } else {
        for (const [k, v] of Object.entries(field)) raw.setHeader(k, v);
      }
      return this as unknown as ExpressResponse;
    },
    setHeader(name: string, value: string | number | string[]) {
      this._reply!.raw.setHeader(name, value as string);
      return this as unknown as ExpressResponse;
    },
  } as ExpressResponse & { _reply: FastifyReply | null };

  return (fastifyReply: FastifyReply) => {
    res._reply = fastifyReply;
    return res as ExpressResponse;
  };
}
