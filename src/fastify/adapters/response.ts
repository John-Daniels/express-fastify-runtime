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
 * Record res._startAt (high-res time) the first time we send, so morgan's :response-time
 * token has the value it normally gets from on-headers (which patches the real writeHead).
 * Set at send time ≈ header-write time; morgan computes response-time = res._startAt - req._startAt.
 */
function recordStartAt(self: { _startAt?: [number, number] }): void {
  if (self._startAt === undefined) self._startAt = process.hrtime();
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
    'res.render is not implemented on the Fastify lane. Wrap this handler with expressLane() so the route runs on the Express lane. See https://github.com/John-Daniels/express-fastify-runtime/blob/main/docs/FAST_PRODUCTION_CHECKLIST.md';
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
        docs: 'https://github.com/John-Daniels/express-fastify-runtime/blob/main/docs/FAST_PRODUCTION_CHECKLIST.md',
      });
    }
    return res;
  };

  return responseProxy(res as ExpressResponse, raw);
}

/** Per-request response instance shape (state held on the instance, methods on the prototype). */
interface ResState {
  _reply: FastifyReply | null;
  _req?: FastifyRequest;
  _locals: Record<string, unknown> | null;
  _startAt?: [number, number];
  _hijacked?: boolean;
  /** Set by the compile.ts continuation runner; called when this response ends without next(). */
  _onEnd?: (() => void) | null;
}

/** Tell the middleware/route chain that this response has ended (so it stops waiting on next()). */
function signalEnd(self: ResState): void {
  if (self._onEnd) self._onEnd();
}

/**
 * Take over the response so we can write to the raw Node stream directly (streaming/SSE,
 * res.write/res.writeHead/res.end). reply.hijack() tells Fastify NOT to send its own response,
 * so the handler returning undefined won't trigger a double-send. Idempotent.
 */
function ensureHijacked(self: ResState): void {
  if (self._hijacked) return;
  self._hijacked = true;
  self._reply!.hijack();
}

/**
 * Shared response prototype: all methods/getters defined ONCE. Per-request state
 * (_reply, _locals) lives on each instance and is read via `this`, so concurrent
 * requests never share mutable state. This is the correctness-critical difference
 * from the old single-shared-object adapter.
 *
 * Lifecycle events (finish/end/close/error) are delegated to the REAL Node response
 * (reply.raw). This is how morgan/on-finished behave on plain Express (where res IS the
 * ServerResponse): they fire on the actual response 'finish', so status, headers,
 * content-length and res._startAt are all set when the log line is written. We do NOT
 * synthesize 'finish' (the old setImmediate approach raced ahead of the real flush under
 * concurrency, producing "- - ms - -" log lines).
 */
const responseProto = {
  get locals() {
    const self = this as unknown as ResState;
    return self._locals ?? (self._locals = {});
  },
  set locals(v: Record<string, unknown>) {
    (this as unknown as ResState)._locals = v;
  },
  get headersSent() {
    return (this as unknown as ResState)._reply?.raw.headersSent ?? false;
  },
  get statusCode() {
    return (this as unknown as ResState)._reply?.raw.statusCode ?? 200;
  },
  set statusCode(code: number) {
    (this as unknown as ResState)._reply!.raw.statusCode = code;
  },
  // Native response fields on-finished/morgan inspect — delegate to the real response.
  get socket() {
    return (this as unknown as ResState)._reply?.raw.socket ?? null;
  },
  get connection() {
    return (this as unknown as ResState)._reply?.raw.socket ?? null;
  },
  get finished() {
    return (this as unknown as ResState)._reply?.raw.writableEnded ?? false;
  },
  get writableEnded() {
    return (this as unknown as ResState)._reply?.raw.writableEnded ?? false;
  },
  get writableFinished() {
    return (this as unknown as ResState)._reply?.raw.writableFinished ?? false;
  },
  on(this: ResState, event: string, listener: (...args: unknown[]) => void) {
    (this._reply!.raw as NodeJS.EventEmitter).on(event, listener);
    return this as unknown as ExpressResponse;
  },
  addListener(this: ResState, event: string, listener: (...args: unknown[]) => void) {
    (this._reply!.raw as NodeJS.EventEmitter).on(event, listener);
    return this as unknown as ExpressResponse;
  },
  once(this: ResState, event: string, listener: (...args: unknown[]) => void) {
    (this._reply!.raw as NodeJS.EventEmitter).once(event, listener);
    return this as unknown as ExpressResponse;
  },
  prependListener(this: ResState, event: string, listener: (...args: unknown[]) => void) {
    (this._reply!.raw as NodeJS.EventEmitter).prependListener(event, listener);
    return this as unknown as ExpressResponse;
  },
  removeListener(this: ResState, event: string, listener: (...args: unknown[]) => void) {
    (this._reply!.raw as NodeJS.EventEmitter).removeListener(event, listener);
    return this as unknown as ExpressResponse;
  },
  emit(this: ResState, event: string, ...args: unknown[]) {
    return (this._reply!.raw as NodeJS.EventEmitter).emit(event, ...args);
  },
  status(this: ResState, code: number) {
    this._reply!.raw.statusCode = code;
    return this as unknown as ExpressResponse;
  },
  sendStatus(this: ResState, code: number) {
    const r = this._reply!;
    r.raw.statusCode = code;
    const body = STATUS_CODES[code] || String(code);
    recordStartAt(this);
    r.type('text/plain').send(body);
    signalEnd(this);
    return this as unknown as ExpressResponse;
  },
  send(this: ResState, body?: unknown) {
    const r = this._reply!;
    const raw = r.raw;
    recordStartAt(this);
    if (body === undefined) {
      raw.end();
    } else if (typeof body === 'object' && body !== null && !Buffer.isBuffer(body)) {
      r.type('application/json').send(body);
    } else if (typeof body === 'string' && !raw.getHeader('Content-Type')) {
      r.type('text/html').send(body);
    } else {
      r.send(body);
    }
    signalEnd(this);
    return this as unknown as ExpressResponse;
  },
  json(this: ResState, body?: unknown) {
    recordStartAt(this);
    this._reply!.type('application/json').send(body);
    signalEnd(this);
    return this as unknown as ExpressResponse;
  },
  jsonp(this: ResState, body?: unknown) {
    recordStartAt(this);
    this._reply!.type('application/json').send(body);
    signalEnd(this);
    return this as unknown as ExpressResponse;
  },
  set(this: ResState, field: string | Record<string, string>, value?: string | string[]) {
    const raw = this._reply!.raw;
    if (typeof field === 'string') {
      raw.setHeader(field, normalizeHeaderValue(value!));
    } else {
      for (const [k, v] of Object.entries(field)) raw.setHeader(k, v);
    }
    return this as unknown as ExpressResponse;
  },
  header(this: ResState, field: string | Record<string, string>, value?: string | string[]) {
    return (this as unknown as ExpressResponse).set(field, value as string);
  },
  setHeader(this: ResState, name: string, value: string | number | string[]) {
    this._reply!.raw.setHeader(name, value as string);
    return this as unknown as ExpressResponse;
  },
  removeHeader(this: ResState, name: string) {
    this._reply!.raw.removeHeader(name);
    return this as unknown as ExpressResponse;
  },
  append(this: ResState, field: string, value: string | string[]) {
    const raw = this._reply!.raw;
    const prev = raw.getHeader(field);
    const next =
      prev === undefined
        ? normalizeHeaderValue(value)
        : [prev, value].flat().join(', ');
    raw.setHeader(field, next);
    return this as unknown as ExpressResponse;
  },
  get(this: ResState, field: string): string | undefined {
    const v = this._reply!.raw.getHeader(field);
    return v === undefined ? undefined : (Array.isArray(v) ? v.join(', ') : String(v));
  },
  getHeader(this: ResState, name: string): string | number | string[] | undefined {
    return this._reply!.raw.getHeader(name);
  },
  type(this: ResState, type: string) {
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
  contentType(this: ResState, type: string) {
    return (this as unknown as ExpressResponse).type(type);
  },
  links(this: ResState, links: Record<string, string>) {
    const link = Object.entries(links)
      .map(([rel, url]) => `<${url}>; rel="${rel}"`)
      .join(', ');
    this._reply!.raw.setHeader('Link', link);
    return this as unknown as ExpressResponse;
  },
  attachment(this: ResState, filename?: string) {
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
  location(this: ResState, url: string) {
    if (url === 'back') {
      const req = this._req;
      const ref =
        (req?.raw?.headers?.referrer as string) || (req?.raw?.headers?.referer as string);
      url = ref || '/';
    }
    this._reply!.raw.setHeader('Location', encodeUrl(url));
    return this as unknown as ExpressResponse;
  },
  redirect(this: ResState, urlOrStatus: string | number, url?: string) {
    const r = this._reply!;
    let status = 302;
    let target: string;
    if (typeof urlOrStatus === 'number') {
      status = urlOrStatus;
      target = url!;
    } else {
      target = urlOrStatus;
    }
    recordStartAt(this);
    r.raw.statusCode = status;
    r.raw.setHeader('Location', target);
    r.send();
    signalEnd(this);
    return this as unknown as ExpressResponse;
  },
  vary(this: ResState, field: string) {
    const raw = this._reply!.raw;
    const v = raw.getHeader('Vary');
    const next = v ? `${v}, ${field}` : field;
    raw.setHeader('Vary', next);
    return this as unknown as ExpressResponse;
  },
  cookie(this: ResState, name: string, val: string | object, options?: CookieOptions) {
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
  clearCookie(this: ResState, name: string, options?: CookieOptions) {
    const opts = { ...options, expires: new Date(0), maxAge: 0 };
    (this as unknown as ExpressResponse).cookie(name, '', opts);
    return this as unknown as ExpressResponse;
  },
  // Streaming / SSE: write directly to the raw Node response. First write hijacks the reply so
  // Fastify doesn't also try to send. Mirrors Express where res IS the ServerResponse.
  write(this: ResState, chunk: unknown, encoding?: BufferEncoding | (() => void), cb?: () => void) {
    ensureHijacked(this);
    return (this._reply!.raw.write as (...a: unknown[]) => boolean)(chunk, encoding, cb);
  },
  writeHead(this: ResState, statusCode: number, ...rest: unknown[]) {
    ensureHijacked(this);
    (this._reply!.raw.writeHead as (...a: unknown[]) => unknown)(statusCode, ...rest);
    return this as unknown as ExpressResponse;
  },
  flushHeaders(this: ResState) {
    ensureHijacked(this);
    this._reply!.raw.flushHeaders();
    return this as unknown as ExpressResponse;
  },
  end(
    this: ResState,
    chunkOrCb?: unknown,
    encodingOrCb?: BufferEncoding | (() => void),
    cb?: () => void
  ) {
    ensureHijacked(this);
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
    signalEnd(this);
    return this as unknown as ExpressResponse;
  },
  render(
    this: ResState,
    _view: string,
    _locals?: Record<string, unknown>,
    _callback?: (err: Error | null, html?: string) => void
  ) {
    const RES_RENDER_HINT =
      'res.render is not implemented on the Fastify lane. Wrap this handler with expressLane() so the route runs on the Express lane. See https://github.com/John-Daniels/express-fastify-runtime/blob/main/docs/FAST_PRODUCTION_CHECKLIST.md';
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[express-fastify-runtime] ${RES_RENDER_HINT}`);
    }
    const r = this._reply!;
    if (!r.raw.headersSent) {
      r.status(501).type('application/json').send({
        error: 'res.render is not implemented on the Fastify lane',
        hint: 'Wrap this handler with expressLane() so the route runs on the Express lane.',
        docs: 'https://github.com/John-Daniels/express-fastify-runtime/blob/main/docs/FAST_PRODUCTION_CHECKLIST.md',
      });
    }
    return this as unknown as ExpressResponse;
  },
};

/**
 * Returns a response adapter that builds a FRESH Express-like res per request.
 *
 * CRITICAL: a new instance is created per request (methods shared via prototype,
 * state per instance). A single shared/mutated res object corrupts concurrent async
 * requests — a later request would overwrite _reply while an earlier request (or its
 * deferred morgan finish listener) is still using it.
 */
export function createResponseAdapter(): (
  fastifyReply: FastifyReply,
  fastifyReq: FastifyRequest
) => ExpressResponse {
  return (fastifyReply: FastifyReply, fastifyReq?: FastifyRequest): ExpressResponse => {
    const res = Object.create(responseProto) as ResState;
    res._reply = fastifyReply;
    res._req = fastifyReq;
    res._locals = null; // lazily created on first res.locals access
    return res as unknown as ExpressResponse;
  };
}
