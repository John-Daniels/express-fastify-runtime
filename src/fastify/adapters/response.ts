/**
 * FastifyReply → Express-like res.
 * Full Express 5.x response API so existing apps work unchanged.
 * Aligns with Express 5.2.1 (see docs/EXPRESS_REFERENCE.md); uses encodeurl for location().
 */

import { STATUS_CODES as HTTP_STATUS_CODES } from 'node:http';
import encodeUrl from 'encodeurl';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CookieOptions, ExpressResponse } from '../../types/express';

const STATUS_CODES = HTTP_STATUS_CODES as Record<number, string>;

function normalizeHeaderValue(value: string | number | string[]): string {
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

/**
 * Wrap res in a Proxy that delegates unknown properties/methods to the raw Node response.
 * Only delegates when the value exists and is callable; never calls .bind on undefined.
 */
function responseProxy<T extends ExpressResponse>(
  res: T,
  raw: import('node:http').ServerResponse,
): T {
  return new Proxy(res, {
    get(target, prop: string | symbol) {
      if (Object.prototype.hasOwnProperty.call(target, prop)) {
        const v = Reflect.get(target, prop);
        if (typeof v === 'function') return (v as Function).bind(target);
        return v;
      }
      const rawVal = Reflect.get(raw, prop);
      if (rawVal === undefined || rawVal === null) return rawVal;
      if (typeof rawVal === 'function') return (rawVal as Function).bind(raw);
      return rawVal;
    },
    has(target, prop) {
      return (
        Object.prototype.hasOwnProperty.call(target, prop) ||
        Reflect.has(raw, prop)
      );
    },
  }) as T;
}

/** One-shot adapter: creates a new res per call (e.g. for adaptResponse(reply, req)). */
export function adaptResponse(fastifyReply: FastifyReply, _fastifyReq: FastifyRequest): ExpressResponse {
  const raw = fastifyReply.raw;
  const res = Object.create(raw) as ExpressResponse & {
    _locals: Record<string, unknown>;
    __efrFinishListeners?: Array<{ fn: (...args: unknown[]) => void; once: boolean }>;
    __efrFinishEmitted?: boolean;
    __efrEmitFinish?: () => void;
  };
  let statusCode = 200;
  res._locals = {};

  // Custom 'finish'/'end' so morgan (on-finished) runs when we've sent, not when OS flushes (keep-alive fix).
  const finishListeners: Array<{ fn: (...args: unknown[]) => void; once: boolean }> = [];
  let finishEmitted = false;
  res.__efrFinishListeners = finishListeners;
  res.__efrEmitFinish = () => {
    if (finishEmitted) return;
    finishEmitted = true;
    res.__efrFinishEmitted = true;
    const toRun = [...finishListeners];
    finishListeners.length = 0;
    toRun.forEach(({ fn }) => {
      try {
        fn();
      } catch (_) {
        /* ignore */
      }
    });
  };

  Object.assign(res, {
    on(event: string, listener: (...args: unknown[]) => void) {
      if (event === "finish" || event === "end") {
        finishListeners.push({ fn: listener as (...args: unknown[]) => void, once: false });
        return res;
      }
      return raw.on.apply(raw, arguments as unknown as Parameters<typeof raw.on>);
    },
    once(event: string, listener: (...args: unknown[]) => void) {
      if (event === "finish" || event === "end") {
        finishListeners.push({ fn: listener as (...args: unknown[]) => void, once: true });
        return res;
      }
      return raw.once.apply(raw, arguments as unknown as Parameters<typeof raw.once>);
    },
    emit(event: string, ...args: unknown[]) {
      if (event === "finish" || event === "end") {
        res.__efrEmitFinish?.();
        return true;
      }
      return raw.emit.apply(raw, arguments as unknown as Parameters<typeof raw.emit>);
    },
  });

  // Emit 'finish' after send so morgan/on-finished run per-request. Use double setImmediate so
  // Fastify's sync send (writeHead + end) has run and res._startAt/status/headers are set (no " - - ms - -").
  // Skip async work when no one listens (hot path: res.json() with no res.on('finish')).
  function afterSend(): void {
    if (finishListeners.length === 0) return;
    setImmediate(() => setImmediate(() => emitFinishNextTick(res)));
  }
  function emitFinishNextTick(r: ExpressResponse & { __efrEmitFinish?: () => void }): void {
    if (r.__efrEmitFinish) r.__efrEmitFinish();
  }

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
    afterSend();
    return res;
  };

  res.send = function (body?: unknown) {
    if (body === undefined) {
      raw.end();
      afterSend();
      return res;
    }
    if (typeof body === 'object' && body !== null && !Buffer.isBuffer(body)) {
      fastifyReply.type('application/json').send(body);
      afterSend();
      return res;
    }
    // Express: string defaults to html when Content-Type not set (response.js send())
    if (typeof body === 'string' && !raw.getHeader('Content-Type')) {
      fastifyReply.type('text/html').send(body);
      afterSend();
      return res;
    }
    fastifyReply.send(body);
    afterSend();
    return res;
  };

  res.json = function (body?: unknown) {
    fastifyReply.type('application/json').send(body);
    afterSend();
    return res;
  };

  res.jsonp = function (body?: unknown) {
    fastifyReply.type('application/json').send(body);
    afterSend();
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

  res.removeHeader = function (name: string) {
    raw.removeHeader(name);
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

  res.getHeader = function (name: string) {
    return raw.getHeader(name);
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

  const RES_RENDER_HINT =
    'res.render is not implemented on the Fastify lane. Wrap this handler with expressLane() so the route runs on the Express lane. See docs/FAST_PRODUCTION_CHECKLIST.md';
  res.render = function (
    _view: string,
    _locals?: Record<string, unknown>,
    _callback?: (err: Error | null, html?: string) => void
  ) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[express-fastify-runtime] ${RES_RENDER_HINT}`);
    }
    if (!raw.headersSent) {
      fastifyReply.status(501).type('application/json').send({
        error: 'res.render is not implemented on the Fastify lane',
        hint: 'Wrap this handler with expressLane() so the route runs on the Express lane.',
        docs: 'docs/FAST_PRODUCTION_CHECKLIST.md',
      });
    }
    return res;
  };

  return responseProxy(res as ExpressResponse, raw);
}

/** Run captured finish listeners after send (morgan-friendly; only when someone listened). */
function emitFinishListeners(listeners: Array<{ fn: (...args: unknown[]) => void }>): void {
  listeners.forEach(({ fn }) => {
    try {
      fn();
    } catch (_) {
      /* ignore */
    }
  });
}

/** Reusable adapter: one res object, mutated per request. Zero alloc hot path; finish/end supported for morgan. */
export function createResponseAdapter(): (
  fastifyReply: FastifyReply,
  fastifyReq: FastifyRequest
) => ExpressResponse {
  const finishListeners: Array<{ fn: (...args: unknown[]) => void; once: boolean }> = [];

  const res = {
    _reply: null as FastifyReply | null,
    _locals: {} as Record<string, unknown>,
    _finishListeners: finishListeners,
    get locals() {
      return this._locals;
    },
    set locals(v: Record<string, unknown>) {
      this._locals = v;
    },
    get headersSent() {
      return this._reply?.raw.headersSent ?? false;
    },
    get statusCode() {
      return this._reply?.raw.statusCode ?? 200;
    },
    on(event: string, listener: (...args: unknown[]) => void) {
      if (event === 'finish' || event === 'end') {
        finishListeners.push({ fn: listener, once: false });
        return this as unknown as ExpressResponse;
      }
      (this._reply!.raw as NodeJS.EventEmitter).on(event, listener as (...args: unknown[]) => void);
      return this as unknown as ExpressResponse;
    },
    once(event: string, listener: (...args: unknown[]) => void) {
      if (event === 'finish' || event === 'end') {
        finishListeners.push({ fn: listener, once: true });
        return this as unknown as ExpressResponse;
      }
      (this._reply!.raw as NodeJS.EventEmitter).once(event, listener as (...args: unknown[]) => void);
      return this as unknown as ExpressResponse;
    },
    emit(event: string, ...args: unknown[]) {
      if (event === 'finish' || event === 'end') {
        const toRun = [...finishListeners];
        finishListeners.length = 0;
        emitFinishListeners(toRun);
        return true;
      }
      return (this._reply!.raw as NodeJS.EventEmitter).emit(event, ...args);
    },
    status(code: number) {
      this._reply!.raw.statusCode = code;
      return this as unknown as ExpressResponse;
    },
    sendStatus(code: number) {
      const r = this._reply!;
      r.raw.statusCode = code;
      const body = STATUS_CODES[code] || String(code);
      r.type('text/plain').send(body);
      if (finishListeners.length > 0) {
        const toRun = [...finishListeners];
        finishListeners.length = 0;
        setImmediate(() => setImmediate(() => emitFinishListeners(toRun)));
      }
      return this as unknown as ExpressResponse;
    },
    send(body?: unknown) {
      const r = this._reply!;
      const raw = r.raw;
      if (finishListeners.length > 0) {
        const toRun = [...finishListeners];
        finishListeners.length = 0;
        setImmediate(() => setImmediate(() => emitFinishListeners(toRun)));
      }
      if (body === undefined) {
        raw.end();
        return this as unknown as ExpressResponse;
      }
      if (typeof body === 'object' && body !== null && !Buffer.isBuffer(body)) {
        r.type('application/json').send(body);
        return this as unknown as ExpressResponse;
      }
      if (typeof body === 'string' && !raw.getHeader('Content-Type')) {
        r.type('text/html').send(body);
        return this as unknown as ExpressResponse;
      }
      r.send(body);
      return this as unknown as ExpressResponse;
    },
    json(body?: unknown) {
      if (finishListeners.length > 0) {
        const toRun = [...finishListeners];
        finishListeners.length = 0;
        setImmediate(() => setImmediate(() => emitFinishListeners(toRun)));
      }
      this._reply!.type('application/json').send(body);
      return this as unknown as ExpressResponse;
    },
    jsonp(body?: unknown) {
      if (finishListeners.length > 0) {
        const toRun = [...finishListeners];
        finishListeners.length = 0;
        setImmediate(() => setImmediate(() => emitFinishListeners(toRun)));
      }
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
    removeHeader(name: string) {
      this._reply!.raw.removeHeader(name);
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
    getHeader(name: string): string | number | string[] | undefined {
      return this._reply!.raw.getHeader(name);
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
      if (finishListeners.length > 0) {
        const toRun = [...finishListeners];
        finishListeners.length = 0;
        setImmediate(() => setImmediate(() => emitFinishListeners(toRun)));
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
    render(
      _view: string,
      _locals?: Record<string, unknown>,
      _callback?: (err: Error | null, html?: string) => void
    ) {
      const RES_RENDER_HINT =
        'res.render is not implemented on the Fastify lane. Wrap this handler with expressLane() so the route runs on the Express lane. See docs/FAST_PRODUCTION_CHECKLIST.md';
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[express-fastify-runtime] ${RES_RENDER_HINT}`);
      }
      const r = this._reply!;
      if (!r.raw.headersSent) {
        r.status(501).type('application/json').send({
          error: 'res.render is not implemented on the Fastify lane',
          hint: 'Wrap this handler with expressLane() so the route runs on the Express lane.',
          docs: 'docs/FAST_PRODUCTION_CHECKLIST.md',
        });
      }
      return this as unknown as ExpressResponse;
    },
  } as ExpressResponse & {
    _reply: FastifyReply | null;
    _req?: FastifyRequest;
    _locals: Record<string, unknown>;
    _finishListeners: Array<{ fn: (...args: unknown[]) => void; once: boolean }>;
  };

  // Return res directly (no Proxy): handler calls like res.json() are direct method calls.
  // All Express response API used by apps/morgan are implemented above on res.
  return (fastifyReply: FastifyReply, fastifyReq?: FastifyRequest) => {
    res._reply = fastifyReply;
    (res as { _req?: FastifyRequest })._req = fastifyReq;
    res._locals = {};
    finishListeners.length = 0;
    return res as ExpressResponse;
  };
}
