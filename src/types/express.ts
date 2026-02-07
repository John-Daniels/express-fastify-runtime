/**
 * Express-like types for the compatibility API.
 * req, res, next - what users write against.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

export type ExpressRequest = IncomingMessage & {
  body?: unknown;
  query?: Record<string, string | string[]>;
  params?: Record<string, string>;
  get(name: string): string | undefined;
  header(name: string): string | undefined;
};

export type ExpressResponse = ServerResponse & {
  status(code: number): ExpressResponse;
  send(body?: unknown): ExpressResponse;
  json(body?: unknown): ExpressResponse;
  set(field: string | Record<string, string>, value?: string): ExpressResponse;
  end(cb?: () => void): ServerResponse;
  end(chunk: unknown, encoding?: BufferEncoding, cb?: () => void): ServerResponse;
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
