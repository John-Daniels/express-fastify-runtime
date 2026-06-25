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
import type { ExpressRequest } from '../../types/express';

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

type RawReq = import('node:http').IncomingMessage;
interface ReqState {
  _raw: RawReq | null;
}

/**
 * Shared request prototype: methods/getters defined ONCE. Per-request state (_raw, url,
 * query, params, body) lives on each instance. Derived values (protocol, ip, cookies,
 * hostname, ...) are LAZY getters so we never compute them for requests that don't read
 * them. Common native IncomingMessage fields are delegated to this._raw for compatibility.
 */
const requestProto = {
  get(name: string) {
    return getHeader((this as unknown as ReqState)._raw?.headers ?? {}, name);
  },
  header(name: string) {
    return getHeader((this as unknown as ReqState)._raw?.headers ?? {}, name);
  },
  get method() {
    return (this as unknown as ReqState)._raw?.method;
  },
  get headers() {
    return (this as unknown as ReqState)._raw?.headers ?? {};
  },
  get rawHeaders() {
    return (this as unknown as ReqState)._raw?.rawHeaders;
  },
  get httpVersion() {
    return (this as unknown as ReqState)._raw?.httpVersion;
  },
  get socket() {
    return (this as unknown as ReqState)._raw?.socket;
  },
  get connection() {
    return (this as unknown as ReqState)._raw?.socket;
  },
  get complete() {
    return (this as unknown as ReqState)._raw?.complete;
  },
  get aborted() {
    return (this as unknown as ReqState)._raw?.aborted ?? false;
  },
  get path() {
    return ((this as { url?: string }).url || '/').split('?')[0] || '/';
  },
  get protocol() {
    const raw = (this as unknown as ReqState)._raw;
    return raw ? getProtocol(raw) : 'http';
  },
  get secure() {
    return (this as unknown as ExpressRequest).protocol === 'https';
  },
  get ip() {
    const raw = (this as unknown as ReqState)._raw;
    return raw ? getIp(raw) : '';
  },
  get ips() {
    const raw = (this as unknown as ReqState)._raw;
    return raw ? getIps(raw) : [];
  },
  get hostname() {
    const raw = (this as unknown as ReqState)._raw;
    return raw ? getHostname(raw) : '';
  },
  get host() {
    return ((this as unknown as ReqState)._raw?.headers?.host as string) ?? '';
  },
  get xhr() {
    return (
      ((this as unknown as ReqState)._raw?.headers?.['x-requested-with'] as string)?.toLowerCase() ===
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
    const raw = (this as unknown as ReqState)._raw;
    return raw ? parseCookieHeader(raw.headers.cookie as string) : {};
  },
  get signedCookies() {
    return {};
  },
  accepts(...types: string[]) {
    const acc = accepts(this as unknown as ExpressRequest);
    return (acc.types as (...t: string[]) => string | false | string[]).apply(acc, types);
  },
  acceptsEncodings(...encodings: string[]) {
    const acc = accepts(this as unknown as ExpressRequest);
    return (acc.encodings as (...e: string[]) => string | false | string[]).apply(acc, encodings);
  },
  acceptsCharsets(...charsets: string[]) {
    const acc = accepts(this as unknown as ExpressRequest);
    return (acc.charsets as (...c: string[]) => string | false | string[]).apply(acc, charsets);
  },
  acceptsLanguages(...langs: string[]) {
    const acc = accepts(this as unknown as ExpressRequest);
    return (acc.languages as (...l: string[]) => string | false | string[]).apply(acc, langs);
  },
  range(size: number, options?: { combine?: boolean }): unknown {
    const r = (this as unknown as ExpressRequest).get('Range');
    if (!r) return undefined;
    return parseRange(size, r, options);
  },
  is(types: string | string[]): string | false {
    const arr = Array.isArray(types) ? types : ([] as string[]).slice.call(arguments);
    return typeis(this as unknown as ExpressRequest, arr) as string | false;
  },
};

/**
 * Returns a request adapter that builds a FRESH Express-like req per request (methods
 * shared via prototype, state per instance).
 *
 * CRITICAL: a new instance is created per request. A single shared/mutated req object
 * corrupts concurrent async requests (a later request would overwrite an earlier one
 * still in flight).
 */
export function createRequestAdapter(): (fastifyReq: FastifyRequest) => ExpressRequest {
  return (fastifyReq: FastifyRequest): ExpressRequest => {
    const req = Object.create(requestProto) as ReqState & {
      url: string;
      originalUrl: string;
      baseUrl: string;
      query: unknown;
      params: unknown;
      body: unknown;
    };
    req._raw = fastifyReq.raw;
    const rawUrl = fastifyReq.raw?.url ?? '/';
    req.url = rawUrl;
    req.originalUrl = rawUrl;
    req.baseUrl = '';
    req.query =
      (fastifyReq as FastifyRequest & { query?: Record<string, string | string[]> }).query ?? {};
    req.params =
      (fastifyReq as FastifyRequest & { params?: Record<string, string> }).params ?? {};
    req.body = (fastifyReq as FastifyRequest & { body?: unknown }).body;
    return req as unknown as ExpressRequest;
  };
}
