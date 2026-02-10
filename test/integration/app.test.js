/**
 * Integration tests: createApp(), use, get, listen, route locking, Router.
 * Run: node --test test/integration/app.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import crypto from "node:crypto";
import http from "node:http";
import { createApp, fast } from "../../dist/index.js";
import { Router } from "express";
import express from "express";
import morgan from "morgan";

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

  it("res.setHeader + res.status(200).send() (e.g. CSV export) works", async () => {
    const app = express();
    app.get("/export-csv", (req, res) => {
      const csv = "name,value\nfoo,1\nbar,2";
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="export.csv"',
      );
      res.status(200).send(csv);
    });
    const fastify = fast(app);
    await fastify.listen({ port: 0, host: "127.0.0.1" });
    const addr = fastify.server?.address();
    assert.ok(addr && typeof addr === "object" && addr.port);
    const res = await fetch(`http://127.0.0.1:${addr.port}/export-csv`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(
      res.headers.get("content-type"),
      "text/csv",
    );
    assert.ok(
      res.headers.get("content-disposition")?.includes("attachment"),
    );
    assert.strictEqual(await res.text(), "name,value\nfoo,1\nbar,2");
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

  it("runtime loaded first: mounted router route on Fastify lane returns 200 and req.baseUrl is set", async () => {
    // This file imports express-fastify-runtime first (above), so Layer is patched; routes compile to Fastify lane
    const app = express();
    const v1 = Router();
    v1.post("/admins/auth/login", (req, res) => {
      assert.strictEqual(req.baseUrl, "/v1", "req.baseUrl should be mount path");
      res.json({ ok: true, baseUrl: req.baseUrl });
    });
    app.use("/v1", v1);
    const fastify = fast(app);
    await fastify.listen({ port: 0, host: "127.0.0.1" });
    const addr = fastify.server?.address();
    assert.ok(addr && typeof addr === "object" && addr.port);
    const res = await fetch(`http://127.0.0.1:${addr.port}/v1/admins/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.strictEqual(res.status, 200, `expected 200, got ${res.status}`);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.baseUrl, "/v1");
    await fastify.close();
  });

  it("res.getHeader and res.removeHeader work on Fastify lane", async () => {
    const app = express();
    app.get("/headers", (req, res) => {
      res.setHeader("X-Custom", "value");
      assert.ok(typeof res.getHeader === "function");
      assert.strictEqual(res.getHeader("X-Custom"), "value");
      res.removeHeader("X-Custom");
      assert.strictEqual(res.getHeader("X-Custom"), undefined);
      res.json({ ok: true });
    });
    const fastify = fast(app);
    await fastify.listen({ port: 0, host: "127.0.0.1" });
    const addr = fastify.server?.address();
    assert.ok(addr && typeof addr === "object" && addr.port);
    const res = await fetch(`http://127.0.0.1:${addr.port}/headers`);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { ok: true });
    await fastify.close();
  });
});

describe("morgan with keep-alive (Fastify lane)", () => {
  it("logs one line per request with keep-alive before connection closes", async () => {
    const logs = [];
    const stream = { write: (line) => logs.push(line.trim()) };
    const app = express();
    app.use(morgan("tiny", { stream }));
    app.get("/ping", (req, res) => res.json({ pong: true }));

    const fastify = fast(app);
    await fastify.listen({ port: 0, host: "127.0.0.1" });
    const addr = fastify.server?.address();
    assert.ok(addr && typeof addr === "object" && addr.port);
    const port = addr.port;

    const agent = new http.Agent({ keepAlive: true });
    const doRequest = () =>
      new Promise((resolve, reject) => {
        const req = http.request(
          { host: "127.0.0.1", port, path: "/ping", agent },
          (res) => {
            res.on("data", () => {});
            res.on("end", resolve);
          },
        );
        req.on("error", reject);
        req.end();
      });

    await doRequest();
    await doRequest();
    await doRequest();

    // Drain event loop so double setImmediate(emit 'finish') runs for all 3 requests
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    agent.destroy();
    await fastify.close();

    assert.strictEqual(
      logs.length,
      3,
      `expected 3 morgan log lines (one per request) with keep-alive, got ${logs.length}: ${logs.join(" | ")}`,
    );
    logs.forEach((line, i) => {
      assert.ok(
        line.includes("GET") && line.includes("/ping") && line.includes("200"),
        `log ${i + 1} should contain GET /ping 200: ${line}`,
      );
      // Catch " - - ms - -" (missing status/response-time/content-length)
      assert.ok(
        !line.includes(" - - ms - -"),
        `log ${i + 1} should have status, response-time, content-length (no " - - ms - -"): ${line}`,
      );
      assert.ok(
        /\d+\.?\d*\s*ms/.test(line),
        `log ${i + 1} should include response time in ms: ${line}`,
      );
    });
  });
});
