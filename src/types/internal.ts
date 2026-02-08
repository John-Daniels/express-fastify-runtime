/**
 * Internal compiler and runtime types.
 * use() accepts Express Router so app.use("/api", router) type-checks (Express-compatible).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type {
  ExpressRequest,
  ExpressResponse,
  ExpressHandler,
  HttpMethod,
} from "./express.js";
import type { Application, Router } from "express";

/**
 * Server-like object returned by app.listen().
 * Express returns http.Server; we return a Promise that resolves to this,
 * so you can call close() (and address()) like with Node's server.
 */
export interface ServerLike {
  /** Stop accepting new connections. Same idea as http.Server#close(). */
  close(callback?: (err?: Error) => void): Promise<void>;
  /** Bound address after listen (port, address, family). Same shape as http.Server#address(). */
  address(): ReturnType<import("node:net").Server["address"]>;
}

export type RouteEntry =
  | {
      type: "middleware";
      path: string;
      handlers: ExpressHandler[];
    }
  | {
      type: "route";
      method: string;
      path: string;
      handlers: ExpressHandler[];
    };

export type Lane = "fastify" | "express";

export type ClassifiedRoute = RouteEntry & {
  lane: Lane;
  /** If true, this route/middleware requires Express (unsafe for Fastify). */
  expressRequired: boolean;
};

/** Handlers accepted in use(); includes Router so app.use("/api", router) type-checks. */
export type UseHandler = ExpressHandler | Router;

export interface ExpressLikeApp {
  use(...handlers: UseHandler[]): this;
  use(
    pathOrHandler: string | UseHandler,
    ...handlers: UseHandler[]
  ): this;
  get(path: string, ...handlers: ExpressHandler[]): this;
  post(path: string, ...handlers: ExpressHandler[]): this;
  put(path: string, ...handlers: ExpressHandler[]): this;
  patch(path: string, ...handlers: ExpressHandler[]): this;
  delete(path: string, ...handlers: ExpressHandler[]): this;
  head(path: string, ...handlers: ExpressHandler[]): this;
  options(path: string, ...handlers: ExpressHandler[]): this;
  all(path: string, ...handlers: ExpressHandler[]): this;
  /** Listen with optional port, host, and callback. Returns Promise<ServerLike> (Express returns http.Server; we are async). */
  listen(
    port?: number,
    host?: string,
    callback?: (err?: Error) => void,
  ): Promise<ServerLike>;
  listen(port: number, callback?: (err?: Error) => void): Promise<ServerLike>;
  listen(callback?: (err?: Error) => void): Promise<ServerLike>;
}

export type RequestAdapter = (fastifyReq: FastifyRequest) => ExpressRequest;
export type ResponseAdapter = (
  fastifyReply: FastifyReply,
  fastifyReq: FastifyRequest,
) => ExpressResponse;

export interface RuntimeContext {
  fastify: FastifyInstance;
  expressApp: import("express").Application;
  locked: boolean;
}
