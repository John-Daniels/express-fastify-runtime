/**
 * FastifyRequest → Express-like req.
 * Full Express 5.x request API so existing apps work unchanged.
 * Reusable: one req object per createRequestAdapter(), mutated per request (zero alloc).
 * Aligns with Express 5.2.1 (see docs/EXPRESS_REFERENCE.md); uses accepts, type-is, range-parser.
 */

import accepts from 'accepts';
import parseRange from 'range-parser';
import typeis from 'type-is';
import type { FastifyRequest } from 'fastify';
import type { ExpressRequest } from '../../types/express.js';

/** Express: Referer and Referrer are interchangeable. */
function getHeader(
  headers: import('node:http').IncomingMessage['headers'],
  name: string
): string | undefined {
  if (!name || typeof name !== 'string') return undefined;
  const lc = name.toLowerCase();
  if (lc === 'referer' || lc === 'referrer') {
    return (headers.referrer as string) || (headers.referer as string);
  }
  const v = headers[lc];
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined;
}

/** Parse Cookie header into key-value object. */
function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader || typeof cookieHeader !== 'string') return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

/** Derive protocol from x-forwarded-proto or socket. */
function getProtocol(raw: import('node:http').IncomingMessage): string {
  const proto = (raw.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim();
  if (proto === 'https' || proto === 'http') return proto;
  return (raw.socket as import('node:tls').TLSSocket)?.encrypted ? 'https' : 'http';
}

/** Derive ip from x-forwarded-for (first) or socket.remoteAddress. */
function getIp(raw: import('node:http').IncomingMessage): string {
  const forwarded = (raw.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  const addr = raw.socket?.remoteAddress;
  if (addr) return addr.startsWith('::ffff:') ? addr.slice(7) : addr;
  return '';
}

/** Parse x-forwarded-for into array (trust proxy). */
function getIps(raw: import('node:http').IncomingMessage): string[] {
  const forwarded = raw.headers['x-forwarded-for'];
  if (!forwarded) return [];
  const list = (typeof forwarded === 'string' ? forwarded : forwarded.join(',')).split(',');
  return list.map((s) => s.trim()).filter(Boolean);
}

/** Hostname from Host header (without port). */
function getHostname(raw: import('node:http').IncomingMessage): string {
  const host = (raw.headers.host as string) ?? '';
  return host.split(':')[0] || '';
}

export function adaptRequest(fastifyReq: FastifyRequest): ExpressRequest {
  const raw = fastifyReq.raw;
  const req = Object.create(raw) as ExpressRequest;
  req.get = req.header = (name: string) => getHeader(raw.headers, name);
  req.accepts = function (...types: string[]) {
    const acc = accepts(req);
    return (acc.types as (...t: string[]) => string | false | string[]).apply(acc, types);
  };
  req.acceptsEncodings = function (...encodings: string[]) {
    const acc = accepts(req);
    return (acc.encodings as (...e: string[]) => string | false | string[]).apply(acc, encodings);
  };
  req.acceptsCharsets = function (...charsets: string[]) {
    const acc = accepts(req);
    return (acc.charsets as (...c: string[]) => string | false | string[]).apply(acc, charsets);
  };
  req.acceptsLanguages = function (...langs: string[]) {
    const acc = accepts(req);
    return (acc.languages as (...l: string[]) => string | false | string[]).apply(acc, langs);
  };
  req.range = function (size: number, options?: { combine?: boolean }) {
    const r = req.get('Range');
    if (!r) return undefined;
    return parseRange(size, r, options);
  };
  req.is = function (types: string | string[]): string | false {
    const arr = Array.isArray(types) ? types : ([] as string[]).slice.call(arguments);
    return typeis(req, arr) as string | false;
  };
  req.query =
    (fastifyReq as FastifyRequest & { query?: Record<string, string | string[]> }).query ?? {};
  req.params =
    (fastifyReq as FastifyRequest & { params?: Record<string, string> }).params ?? {};
  req.body = (fastifyReq as FastifyRequest & { body?: unknown }).body;
  const rawUrl = raw.url ?? '/';
  req.url = rawUrl;
  req.originalUrl = rawUrl;
  req.baseUrl = '';
  req.path = rawUrl.split('?')[0] || '/';
  req.protocol = getProtocol(raw);
  req.secure = req.protocol === 'https';
  req.ip = getIp(raw);
  req.ips = getIps(raw);
  req.hostname = getHostname(raw);
  req.host = (raw.headers.host as string) ?? '';
  req.xhr =
    (raw.headers['x-requested-with'] as string)?.toLowerCase() === 'xmlhttprequest';
  req.fresh = false;
  req.stale = true;
  req.cookies = parseCookieHeader(raw.headers.cookie as string);
  req.signedCookies = {};
  return req;
}

/** Creates a reusable request adapter: one req object, mutated per request (zero alloc). */
export function createRequestAdapter(): (fastifyReq: FastifyRequest) => ExpressRequest {
  const req = {
    _raw: null as import('node:http').IncomingMessage | null,
    _query: {} as Record<string, string | string[]>,
    _params: {} as Record<string, string>,
    _body: undefined as unknown,
    url: '',
    baseUrl: '',
    originalUrl: '',
    get(name: string) {
      return getHeader(this._raw?.headers ?? {}, name);
    },
    header(name: string) {
      return getHeader(this._raw?.headers ?? {}, name);
    },
    get method() {
      return this._raw?.method;
    },
    get headers() {
      return this._raw?.headers ?? {};
    },
    get path() {
      return (this.url || '/').split('?')[0] || '/';
    },
    get protocol() {
      return this._raw ? getProtocol(this._raw) : 'http';
    },
    get secure() {
      return this.protocol === 'https';
    },
    get ip() {
      return this._raw ? getIp(this._raw) : '';
    },
    get ips() {
      return this._raw ? getIps(this._raw) : [];
    },
    get hostname() {
      return this._raw ? getHostname(this._raw) : '';
    },
    get host() {
      return (this._raw?.headers?.host as string) ?? '';
    },
    get xhr() {
      return (
        (this._raw?.headers?.['x-requested-with'] as string)?.toLowerCase() ===
        'xmlhttprequest'
      );
    },
    get fresh() {
      return false;
    },
    get stale() {
      return true;
    },
    get cookies() {
      return this._raw
        ? parseCookieHeader(this._raw.headers.cookie as string)
        : {};
    },
    get signedCookies() {
      return {};
    },
    accepts(...types: string[]) {
      const acc = accepts(this as ExpressRequest);
      return (acc.types as (...t: string[]) => string | false | string[]).apply(acc, types);
    },
    acceptsEncodings(...encodings: string[]) {
      const acc = accepts(this as ExpressRequest);
      return (acc.encodings as (...e: string[]) => string | false | string[]).apply(acc, encodings);
    },
    acceptsCharsets(...charsets: string[]) {
      const acc = accepts(this as ExpressRequest);
      return (acc.charsets as (...c: string[]) => string | false | string[]).apply(acc, charsets);
    },
    acceptsLanguages(...langs: string[]) {
      const acc = accepts(this as ExpressRequest);
      return (acc.languages as (...l: string[]) => string | false | string[]).apply(acc, langs);
    },
    range(size: number, options?: { combine?: boolean }): unknown {
      const r = this.get('Range');
      if (!r) return undefined;
      return parseRange(size, r, options);
    },
    is(types: string | string[]): string | false {
      const arr = Array.isArray(types) ? types : ([] as string[]).slice.call(arguments);
      return typeis(this as ExpressRequest, arr) as string | false;
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
    req._query =
      (fastifyReq as FastifyRequest & { query?: Record<string, string | string[]> })
        .query ?? {};
    req._params =
      (fastifyReq as FastifyRequest & { params?: Record<string, string> }).params ?? {};
    req._body = (fastifyReq as FastifyRequest & { body?: unknown }).body;
    req.query = req._query;
    req.params = req._params;
    req.body = req._body;
    return req as ExpressRequest;
  };
}
