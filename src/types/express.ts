/**
 * Express-like types for the compatibility API.
 * req, res, next - what users write against.
 * Extended to cover Express 5.x response and request API used in adapters.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

/** Cookie options (Express-compatible shape). */
export interface CookieOptions {
  maxAge?: number;
  signed?: boolean;
  expires?: Date;
  httpOnly?: boolean;
  path?: string;
  domain?: string;
  secure?: boolean;
  sameSite?: boolean | 'lax' | 'strict' | 'none';
}

export type ExpressRequest = IncomingMessage & {
  body?: unknown;
  query?: Record<string, string | string[]>;
  params?: Record<string, string>;
  url: string;
  baseUrl: string;
  originalUrl: string;
  path?: string;
  method?: string;
  headers?: IncomingMessage['headers'];
  get(name: string): string | undefined;
  header(name: string): string | undefined;
  /** Trust proxy: protocol, ip, hostname, etc. (adapter-derived when possible). */
  protocol?: string;
  secure?: boolean;
  ip?: string;
  ips?: string[];
  hostname?: string;
  host?: string;
  /** Accepts (Accept header); stub or parsed. */
  accepts?(...types: string[]): string | false | string[];
  acceptsCharsets?(...charsets: string[]): string | false | string[];
  acceptsEncodings?(...encodings: string[]): string | false | string[];
  acceptsLanguages?(...langs: string[]): string | false | string[];
  is?(type: string): string | false | null;
  range?(size: number, options?: { combine?: boolean }): unknown;
  xhr?: boolean;
  fresh?: boolean;
  stale?: boolean;
  cookies?: Record<string, string>;
  signedCookies?: Record<string, string>;
  app?: unknown;
  res?: ExpressResponse;
  next?: unknown;
  route?: unknown;
};

export type ExpressResponse = ServerResponse & {
  status(code: number): ExpressResponse;
  send(body?: unknown): ExpressResponse;
  json(body?: unknown): ExpressResponse;
  set(field: string | Record<string, string>, value?: string | string[]): ExpressResponse;
  setHeader(name: string, value: string | number | string[]): ServerResponse;
  removeHeader(name: string): ExpressResponse;
  header(field: string | Record<string, string>, value?: string | string[]): ExpressResponse;
  sendStatus(code: number): ExpressResponse;
  links(links: Record<string, string>): ExpressResponse;
  jsonp(body?: unknown): ExpressResponse;
  type(type: string): ExpressResponse;
  contentType(type: string): ExpressResponse;
  format(obj: Record<string, (() => void) | (() => Promise<void>)>): ExpressResponse;
  attachment(filename?: string): ExpressResponse;
  append(field: string, value: string | string[]): ExpressResponse;
  get(field: string): string | undefined;
  getHeader(name: string): string | number | string[] | undefined;
  clearCookie(name: string, options?: CookieOptions): ExpressResponse;
  cookie(name: string, val: string | object, options?: CookieOptions): ExpressResponse;
  location(url: string): ExpressResponse;
  redirect(url: string): ExpressResponse;
  redirect(status: number, url: string): ExpressResponse;
  vary(field: string): ExpressResponse;
  end(cb?: () => void): ServerResponse;
  end(chunk: unknown, encoding?: BufferEncoding, cb?: () => void): ServerResponse;
  /** View engine render (Express lane only; on Fastify lane we send 501 + dev warning). */
  render?(
    view: string,
    locals?: Record<string, unknown>,
    callback?: (err: Error | null, html?: string) => void
  ): ExpressResponse;
  /** Per-request response locals (Express-compatible). */
  locals: Record<string, unknown>;
  headersSent: boolean;
  app?: unknown;
  req?: ExpressRequest;
  charset?: string;
};

export type NextFunction = (err?: Error | unknown) => void;

export type ExpressMiddleware = (
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction
) => void | Promise<void>;

export type ExpressErrorMiddleware = (
  err: Error,
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction
) => void | Promise<void>;

export type ExpressHandler = ExpressMiddleware | ExpressErrorMiddleware;

export const HTTP_METHODS = [
  'get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all'
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];
