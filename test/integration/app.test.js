/**
 * Integration tests: createApp(), use, get, listen, route locking, Router.
 * Run: node --test test/integration/app.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import crypto from "node:crypto";
import { createApp, fast } from "../../dist/index.js";
import { Router } from "express";
import express from "express";

describe("createApp", () => {
  it("returns app with use, get, post, listen", () => {
    const app = createApp();
    assert.strictEqual(typeof app.use, "function");
    assert.strictEqual(typeof app.get, "function");
    assert.strictEqual(typeof app.post, "function");
    assert.strictEqual(typeof app.listen, "function");
  });

  it("app.use and app.get do not throw before listen", () => {
    const app = createApp();
    app.use((req, res, next) => next());
    app.get("/foo", (req, res) => res.json({ ok: true }));
    assert.ok(true);
  });

  it("app.use after listen throws", async () => {
    const app = createApp();
    app.get("/x", (req, res) => res.end());
    const server = await app.listen(0);
    assert.throws(
      () => app.use((req, res, next) => next()),
      /Cannot add routes or middleware after listen/,
    );
    await server.close();
  });

  it("app.get after listen throws", async () => {
    const app = createApp();
    app.get("/y", (req, res) => res.end());
    const server = await app.listen(0);
    assert.throws(
      () => app.get("/z", (req, res) => res.end()),
      /Cannot add routes or middleware after listen/,
    );
    await server.close();
  });

  it("app.use(path, express.Router()) flattens router and route responds", async () => {
    const router = Router();
    router.get("/bar", (req, res) => res.json({ from: "router" }));
    const app = createApp();
    app.use("/api", router);
    const server = await app.listen(0);
    const addr = server.address();
    assert.ok(addr && typeof addr === "object" && addr.port);
    const res = await fetch(`http://127.0.0.1:${addr.port}/api/bar`);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { from: "router" });
    await server.close();
  });

  it("app.use(path, router) flattens router with router.use(path, fn) when Layer has _path", async () => {
    const router = Router();
    router.use("/auth", (req, res, next) => next());
    router.get("/auth/bar", (req, res) =>
      res.json({ from: "router-with-use" }),
    );
    const app = createApp();
    app.use("/api", router);
    const server = await app.listen(0);
    const addr = server.address();
    assert.ok(addr && typeof addr === "object" && addr.port);
    const res = await fetch(`http://127.0.0.1:${addr.port}/api/auth/bar`);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { from: "router-with-use" });
    await server.close();
  });
});

describe("large JSON payload (regression)", () => {
  it("POST 1MB JSON with express.json() parses once, req.body available, latency < 500ms", async () => {
    const size = 1024 * 1024; // 1MB
    const payload = {
      data: crypto.randomBytes(size).toString("hex").slice(0, size),
    };
    const body = JSON.stringify(payload);

    const app = createApp();
    app.use(express.json({ limit: "10mb" }));
    let receivedBody = null;
    app.post("/", (req, res) => {
      receivedBody = req.body;
      res.json({ ok: true, size: req.body?.data?.length ?? 0 });
    });

    const server = await app.listen(0);
    const addr = server.address();
    assert.ok(addr && typeof addr === "object" && addr.port);

    const start = Date.now();
    const res = await fetch(`http://127.0.0.1:${addr.port}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const elapsed = Date.now() - start;

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.ok, true);
    assert.strictEqual(json.size, payload.data.length);
    assert.ok(
      receivedBody && receivedBody.data?.length === payload.data.length,
      "req.body has parsed data with correct length",
    );
    assert.ok(
      elapsed < 500,
      `1MB JSON should complete in <500ms (was ${elapsed}ms)`,
    );

    await server.close();
  });
});

describe("fast(expressApp)", () => {
  it("compiles Express app and returns Fastify instance; GET responds", async () => {
    const app = express();
    app.get("/ping", (req, res) => res.json({ pong: true }));
    const fastify = fast(app);
    await fastify.listen({ port: 0, host: "127.0.0.1" });
    const addr = fastify.server?.address();
    assert.ok(addr && typeof addr === "object" && addr.port);
    const res = await fetch(`http://127.0.0.1:${addr.port}/ping`);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { pong: true });
    await fastify.close();
  });

  it.skip("Express 4-arg error middleware receives errors from Fastify lane (next(err))", async () => {
    const app = express();
    app.get("/fail", (req, res, next) => next(new Error("expected error")));
    app.use((err, req, res, next) => {
      res.status(500).json({ error: err.message });
    });
    const fastify = fast(app);
    await fastify.listen({ port: 0, host: "127.0.0.1" });
    const addr = fastify.server?.address();
    assert.ok(addr && typeof addr === "object" && addr.port);
    const res = await fetch(`http://127.0.0.1:${addr.port}/fail`);
    const body = await res.json().catch(() => ({}));
    assert.strictEqual(
      res.status,
      500,
      `expected 500, got ${res.status} body=${JSON.stringify(body)}`,
    );
    assert.strictEqual(
      body.error,
      "expected error",
      `expected body.error 'expected error', got ${JSON.stringify(body)}`,
    );
    await fastify.close();
  });

  it("Express 4-arg error middleware receives errors when request falls back to Express lane", async () => {
    // App with only middleware (no flattened routes) so /fail is handled by notFoundHandler → Express
    const app = express();
    app.use((req, res, next) => {
      if (req.method === "GET" && (req.url === "/fail" || req.path === "/fail"))
        throw new Error("expected error");
      next();
    });
    app.use((err, req, res, next) => {
      res.status(500).json({ error: err.message });
    });
    const fastify = fast(app);
    await fastify.listen({ port: 0, host: "127.0.0.1" });
    const addr = fastify.server?.address();
    assert.ok(addr && typeof addr === "object" && addr.port);
    const res = await fetch(`http://127.0.0.1:${addr.port}/fail`);
    const body = await res.json().catch(() => ({}));
    assert.strictEqual(
      res.status,
      500,
      `expected 500, got ${res.status} body=${JSON.stringify(body)}`,
    );
    assert.strictEqual(
      body.error,
      "expected error",
      `expected body.error 'expected error', got ${JSON.stringify(body)}`,
    );
    await fastify.close();
  });
});
