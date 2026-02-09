/**
 * FastifyReply → Express-like res.
 * Full Express 5.x response API so existing apps work unchanged.
 * Aligns with Express 5.2.1 (see docs/EXPRESS_REFERENCE.md); uses encodeurl for location().
 */

import { STATUS_CODES as HTTP_STATUS_CODES } from 'node:http';
import encodeUrl from 'encodeurl';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CookieOptions, ExpressResponse } from '../../types/express.js';

const STATUS_CODES = HTTP_STATUS_CODES as Record<number, string>;

function normalizeHeaderValue(value: string | number | string[]): string {
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

/** One-shot adapter: creates a new res per call (e.g. for adaptResponse(reply, req)). */
export function adaptResponse(fastifyReply: FastifyReply, _fastifyReq: FastifyRequest): ExpressResponse {
  const raw = fastifyReply.raw;
  const res = Object.create(raw) as ExpressResponse & { _locals: Record<string, unknown> };
  let statusCode = 200;
  res._locals = {};

  res.locals = res._locals;
  Object.defineProperty(res, 'headersSent', {
    get() {
      return raw.headersSent;
    },
    configurable: true,
    enumerable: true,
  });

  res.status = function (code: number) {
    statusCode = code;
    raw.statusCode = code;
    return res;
  };

  res.sendStatus = function (code: number) {
    raw.statusCode = code;
    const body = STATUS_CODES[code] || String(code);
    fastifyReply.type('text/plain').send(body);
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

  res.jsonp = function (body?: unknown) {
    fastifyReply.type('application/json').send(body);
    return res;
  };

  res.set = res.header = function (
    field: string | Record<string, string>,
    value?: string | string[]
  ) {
    if (typeof field === 'string') {
      raw.setHeader(field, normalizeHeaderValue(value!));
    } else {
      for (const [k, v] of Object.entries(field)) raw.setHeader(k, v);
    }
    return res;
  };

  res.setHeader = function (name: string, value: string | number | string[]) {
    raw.setHeader(name, value as string);
    return res;
  };

  res.append = function (field: string, value: string | string[]) {
    const prev = raw.getHeader(field);
    const next =
      prev === undefined
        ? normalizeHeaderValue(value)
        : [prev, value].flat().join(', ');
    raw.setHeader(field, next);
    return res;
  };

  res.get = function (field: string): string | undefined {
    const v = raw.getHeader(field);
    return v === undefined ? undefined : (Array.isArray(v) ? v.join(', ') : String(v));
  };

  res.type = res.contentType = function (type: string) {
    if (!type.includes('/')) {
      const mime: Record<string, string> = {
        json: 'application/json',
        html: 'text/html',
        text: 'text/plain',
        xml: 'application/xml',
      };
      fastifyReply.type(mime[type] || type);
    } else {
      raw.setHeader('Content-Type', type);
    }
    return res;
  };

  res.links = function (links: Record<string, string>) {
    const link = Object.entries(links)
      .map(([rel, url]) => `<${url}>; rel="${rel}"`)
      .join(', ');
    raw.setHeader('Link', link);
    return res;
  };

  res.attachment = function (filename?: string) {
    if (filename) {
      raw.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename.replace(/"/g, '\\"')}"`
      );
    } else {
      raw.setHeader('Content-Disposition', 'attachment');
    }
    return res;
  };

  res.location = function (url: string) {
    if (url === 'back') {
      const ref =
        (_fastifyReq?.raw?.headers?.referrer as string) ||
        (_fastifyReq?.raw?.headers?.referer as string);
      url = ref || '/';
    }
    raw.setHeader('Location', encodeUrl(url));
    return res;
  };

  res.redirect = function (urlOrStatus: string | number, url?: string) {
    let status = 302;
    let target: string;
    if (typeof urlOrStatus === 'number') {
      status = urlOrStatus;
      target = url!;
    } else {
      target = urlOrStatus;
    }
    raw.statusCode = status;
    raw.setHeader('Location', target);
    fastifyReply.send();
    return res;
  };

  res.vary = function (field: string) {
    const v = raw.getHeader('Vary');
    const next = v ? `${v}, ${field}` : field;
    raw.setHeader('Vary', next);
    return res;
  };

  res.cookie = function (name: string, val: string | object, options?: CookieOptions) {
    const value =
      typeof val === 'object' ? 'j:' + JSON.stringify(val) : encodeURIComponent(String(val));
    const parts = [`${name}=${value}`];
    if (options) {
      if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
      if (options.path) parts.push(`Path=${options.path}`);
      if (options.domain) parts.push(`Domain=${options.domain}`);
      if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
      if (options.httpOnly) parts.push('HttpOnly');
      if (options.secure) parts.push('Secure');
      if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
    }
    const setCookie = raw.getHeader('Set-Cookie');
    const prev: string[] = setCookie
      ? (Array.isArray(setCookie) ? setCookie.map(String) : [String(setCookie)])
      : [];
    raw.setHeader('Set-Cookie', [...prev, parts.join('; ')]);
    return res;
  };

  res.clearCookie = function (name: string, options?: CookieOptions) {
    const opts = { ...options, expires: new Date(0), maxAge: 0 };
    res.cookie(name, '', opts);
    return res;
  };

  res.end = function (
    chunkOrCb?: unknown,
    encodingOrCb?: BufferEncoding | (() => void),
    cb?: () => void
  ) {
    if (typeof chunkOrCb === 'function') {
      raw.end(chunkOrCb as () => void);
    } else if (chunkOrCb !== undefined && chunkOrCb !== null) {
      const enc = typeof encodingOrCb === 'string' ? encodingOrCb : undefined;
      const done = typeof encodingOrCb === 'function' ? (encodingOrCb as () => void) : cb;
      if (enc !== undefined) {
        raw.end(chunkOrCb as string | Buffer, enc, done);
      } else {
        raw.end(chunkOrCb as string | Buffer, done);
      }
    } else {
      raw.end();
    }
    return res;
  };

  return res as ExpressResponse;
}

/** Reusable adapter: one res object, mutated per request. */
export function createResponseAdapter(): (
  fastifyReply: FastifyReply,
  fastifyReq: FastifyRequest
) => ExpressResponse {
  const res = {
    _reply: null as FastifyReply | null,
    _locals: {} as Record<string, unknown>,
    get locals() {
      return this._locals;
    },
    set locals(v: Record<string, unknown>) {
      this._locals = v;
    },
    get headersSent() {
      return this._reply?.raw.headersSent ?? false;
    },
    status(code: number) {
      this._reply!.raw.statusCode = code;
      return this as unknown as ExpressResponse;
    },
    sendStatus(code: number) {
      this._reply!.raw.statusCode = code;
      const body = STATUS_CODES[code] || String(code);
      this._reply!.type('text/plain').send(body);
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
    jsonp(body?: unknown) {
      this._reply!.type('application/json').send(body);
      return this as unknown as ExpressResponse;
    },
    set(field: string | Record<string, string>, value?: string | string[]) {
      const raw = this._reply!.raw;
      if (typeof field === 'string') {
        raw.setHeader(field, normalizeHeaderValue(value!));
      } else {
        for (const [k, v] of Object.entries(field)) raw.setHeader(k, v);
      }
      return this as unknown as ExpressResponse;
    },
    header(field: string | Record<string, string>, value?: string | string[]) {
      return this.set(field, value as string);
    },
    setHeader(name: string, value: string | number | string[]) {
      this._reply!.raw.setHeader(name, value as string);
      return this as unknown as ExpressResponse;
    },
    append(field: string, value: string | string[]) {
      const raw = this._reply!.raw;
      const prev = raw.getHeader(field);
      const next =
        prev === undefined
          ? normalizeHeaderValue(value)
          : [prev, value].flat().join(', ');
      raw.setHeader(field, next);
      return this as unknown as ExpressResponse;
    },
    get(field: string): string | undefined {
      const v = this._reply!.raw.getHeader(field);
      return v === undefined ? undefined : (Array.isArray(v) ? v.join(', ') : String(v));
    },
    type(type: string) {
      if (!type.includes('/')) {
        const mime: Record<string, string> = {
          json: 'application/json',
          html: 'text/html',
          text: 'text/plain',
          xml: 'application/xml',
        };
        this._reply!.type(mime[type] || type);
      } else {
        this._reply!.raw.setHeader('Content-Type', type);
      }
      return this as unknown as ExpressResponse;
    },
    contentType(type: string) {
      return this.type(type);
    },
    links(links: Record<string, string>) {
      const link = Object.entries(links)
        .map(([rel, url]) => `<${url}>; rel="${rel}"`)
        .join(', ');
      this._reply!.raw.setHeader('Link', link);
      return this as unknown as ExpressResponse;
    },
    attachment(filename?: string) {
      const raw = this._reply!.raw;
      if (filename) {
        raw.setHeader(
          'Content-Disposition',
          `attachment; filename="${filename.replace(/"/g, '\\"')}"`
        );
      } else {
        raw.setHeader('Content-Disposition', 'attachment');
      }
      return this as unknown as ExpressResponse;
    },
    location(url: string) {
      if (url === 'back') {
        const req = (this as { _req?: FastifyRequest })._req;
        const ref =
          (req?.raw?.headers?.referrer as string) || (req?.raw?.headers?.referer as string);
        url = ref || '/';
      }
      this._reply!.raw.setHeader('Location', encodeUrl(url));
      return this as unknown as ExpressResponse;
    },
    redirect(urlOrStatus: string | number, url?: string) {
      const r = this._reply!;
      let status = 302;
      let target: string;
      if (typeof urlOrStatus === 'number') {
        status = urlOrStatus;
        target = url!;
      } else {
        target = urlOrStatus;
      }
      r.raw.statusCode = status;
      r.raw.setHeader('Location', target);
      r.send();
      return this as unknown as ExpressResponse;
    },
    vary(field: string) {
      const raw = this._reply!.raw;
      const v = raw.getHeader('Vary');
      const next = v ? `${v}, ${field}` : field;
      raw.setHeader('Vary', next);
      return this as unknown as ExpressResponse;
    },
    cookie(name: string, val: string | object, options?: CookieOptions) {
      const value =
        typeof val === 'object' ? 'j:' + JSON.stringify(val) : encodeURIComponent(String(val));
      const parts = [`${name}=${value}`];
      if (options) {
        if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
        if (options.path) parts.push(`Path=${options.path}`);
        if (options.domain) parts.push(`Domain=${options.domain}`);
        if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
        if (options.httpOnly) parts.push('HttpOnly');
        if (options.secure) parts.push('Secure');
        if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
      }
      const raw = this._reply!.raw;
      const setCookie = raw.getHeader('Set-Cookie');
      const prev: string[] = setCookie
        ? (Array.isArray(setCookie) ? setCookie.map(String) : [String(setCookie)])
        : [];
      raw.setHeader('Set-Cookie', [...prev, parts.join('; ')]);
      return this as unknown as ExpressResponse;
    },
    clearCookie(name: string, options?: CookieOptions) {
      const opts = { ...options, expires: new Date(0), maxAge: 0 };
      this.cookie(name, '', opts);
      return this as unknown as ExpressResponse;
    },
    end(
      chunkOrCb?: unknown,
      encodingOrCb?: BufferEncoding | (() => void),
      cb?: () => void
    ) {
      const raw = this._reply!.raw;
      if (typeof chunkOrCb === 'function') {
        raw.end(chunkOrCb as () => void);
      } else if (chunkOrCb !== undefined && chunkOrCb !== null) {
        const enc = typeof encodingOrCb === 'string' ? encodingOrCb : undefined;
        const done = typeof encodingOrCb === 'function' ? (encodingOrCb as () => void) : cb;
        if (enc !== undefined) {
          raw.end(chunkOrCb as string | Buffer, enc, done);
        } else {
          raw.end(chunkOrCb as string | Buffer, done);
        }
      } else {
        raw.end();
      }
      return this as unknown as ExpressResponse;
    },
  } as ExpressResponse & {
    _reply: FastifyReply | null;
    _req?: FastifyRequest;
    _locals: Record<string, unknown>;
  };

  return (fastifyReply: FastifyReply, fastifyReq?: FastifyRequest) => {
    res._reply = fastifyReply;
    (res as { _req?: FastifyRequest })._req = fastifyReq;
    res._locals = {};
    return res as ExpressResponse;
  };
}
