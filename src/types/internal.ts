/**
 * Internal compiler and runtime types.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ExpressRequest, ExpressResponse, ExpressHandler, HttpMethod } from './express.js';

export type RouteEntry = {
  type: 'middleware';
  path: string;
  handlers: ExpressHandler[];
} | {
  type: 'route';
  method: string;
  path: string;
  handlers: ExpressHandler[];
};

export type Lane = 'fastify' | 'express';

export type ClassifiedRoute = RouteEntry & {
  lane: Lane;
  /** If true, this route/middleware requires Express (unsafe for Fastify). */
  expressRequired: boolean;
};

export interface ExpressLikeApp {
  use(pathOrHandler: string | ExpressHandler, ...handlers: ExpressHandler[]): this;
  use(...handlers: ExpressHandler[]): this;
  get(path: string, ...handlers: ExpressHandler[]): this;
  post(path: string, ...handlers: ExpressHandler[]): this;
  put(path: string, ...handlers: ExpressHandler[]): this;
  patch(path: string, ...handlers: ExpressHandler[]): this;
  delete(path: string, ...handlers: ExpressHandler[]): this;
  head(path: string, ...handlers: ExpressHandler[]): this;
  options(path: string, ...handlers: ExpressHandler[]): this;
  all(path: string, ...handlers: ExpressHandler[]): this;
  listen(port?: number, host?: string, callback?: () => void): unknown;
  listen(port: number, callback?: () => void): unknown;
  listen(callback?: () => void): unknown;
}

export type RequestAdapter = (fastifyReq: FastifyRequest) => ExpressRequest;
export type ResponseAdapter = (fastifyReply: FastifyReply, fastifyReq: FastifyRequest) => ExpressResponse;

export interface RuntimeContext {
  fastify: FastifyInstance;
  expressApp: import('express').Application;
  locked: boolean;
}
