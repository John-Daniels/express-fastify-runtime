/**
 * FastifyRequest → Express-like req.
 * Reusable: one object per adapter, mutated per request (zero alloc hot path).
 */

import type { FastifyRequest } from 'fastify';
import type { ExpressRequest } from '../../types/express.js';

export function adaptRequest(fastifyReq: FastifyRequest): ExpressRequest {
  const raw = fastifyReq.raw;
  const req = Object.create(raw) as ExpressRequest;
  req.get = req.header = (name: string) => raw.headers[name?.toLowerCase()] as string | undefined;
  req.query = (fastifyReq as FastifyRequest & { query?: Record<string, string | string[]> }).query ?? {};
  req.params = (fastifyReq as FastifyRequest & { params?: Record<string, string> }).params ?? {};
  req.body = (fastifyReq as FastifyRequest & { body?: unknown }).body;
  return req;
}

/** Creates a reusable request adapter: one req object, mutated per request (zero alloc). */
export function createRequestAdapter(): (fastifyReq: FastifyRequest) => ExpressRequest {
  const req: ExpressRequest & {
    _raw: import('node:http').IncomingMessage | null;
    _query: Record<string, string | string[]>;
    _params: Record<string, string>;
    _body: unknown;
  } = {
    _raw: null,
    _query: {},
    _params: {},
    _body: undefined,
    url: '',
    baseUrl: '',
    originalUrl: '',
    get(name: string) {
      return this._raw?.headers[name?.toLowerCase()] as string | undefined;
    },
    header(name: string) {
      return this._raw?.headers[name?.toLowerCase()] as string | undefined;
    },
    get method() {
      return this._raw?.method;
    },
    get headers() {
      return this._raw?.headers ?? {};
    },
  } as ExpressRequest & {
    _raw: import('node:http').IncomingMessage | null;
    _query: Record<string, string | string[]>;
    _params: Record<string, string>;
    _body: unknown;
  };

  return (fastifyReq: FastifyRequest): ExpressRequest => {
    req._raw = fastifyReq.raw;
    const rawUrl = fastifyReq.raw?.url ?? '/';
    req.url = rawUrl;
    req.originalUrl = rawUrl;
    req.baseUrl = '';
    req._query = (fastifyReq as FastifyRequest & { query?: Record<string, string | string[]> }).query ?? {};
    req._params = (fastifyReq as FastifyRequest & { params?: Record<string, string> }).params ?? {};
    req._body = (fastifyReq as FastifyRequest & { body?: unknown }).body;
    req.query = req._query;
    req.params = req._params;
    req.body = req._body;
    return req as ExpressRequest;
  };
}
