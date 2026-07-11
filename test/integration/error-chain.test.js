/**
 * Express error-middleware CHAIN on fast(). A common setup (Sentry.setupExpressErrorHandler + your
 * global handler) registers TWO 4-arg error middlewares: the first captures the error and calls
 * next(err) to defer; the second maps the status and responds. The runtime must run the whole chain
 * — stopping at the first (and treating next(err) as failure) turned every error into a generic 500.
 * Also verifies expressLane still forces the Express lane when the handler is wrapped by an APM.
 * Run: node --test test/integration/error-chain.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { fast, expressLane } from "../../dist/index.js";
import express from "express";

async function listen(app) {
  const f = fast(app);
  await f.listen({ port: 0, host: "127.0.0.1" });
  return { close: () => f.close(), port: f.server.address().port };
}

class CustomError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

describe("error-middleware chain on fast()", () => {
  it("a deferring first handler (Sentry-like next(err)) reaches the second, which maps the status", async () => {
    const app = express();
    let capturedByFirst = false;
    let secondRan = false;
    app.get("/boom", async () => {
      throw new CustomError("RATE_OUT_OF_BAND", 400);
    });
    // First error middleware: capture + defer (like Sentry.setupExpressErrorHandler).
    app.use((err, req, res, next) => {
      capturedByFirst = true;
      next(err);
    });
    // Second (real) error middleware: map the status and respond.
    app.use((err, req, res, next) => {
      secondRan = true;
      res.status(err.statusCode || 500).json({ error: err.message });
    });

    const { close, port } = await listen(app);
    const r = await fetch(`http://127.0.0.1:${port}/boom`);
    assert.strictEqual(r.status, 400, "must map to 400, not a generic 500");
    assert.deepStrictEqual(await r.json(), { error: "RATE_OUT_OF_BAND" });
    assert.ok(capturedByFirst, "first (deferring) handler ran");
    assert.ok(secondRan, "second (mapping) handler ran");
    await close();
  });

  it("sync throw is mapped too, and the error handler can use res.send/res.set/res.type", async () => {
    const app = express();
    app.get("/sync", () => {
      throw new CustomError("NOPE", 409);
    });
    app.use((err, req, res, next) => next(err)); // logger/APM defers
    app.use((err, req, res, next) => {
      res.set("x-handled", "1");
      res.type("application/json");
      res.status(err.statusCode).send({ status: "error", message: err.message });
    });
    const { close, port } = await listen(app);
    const r = await fetch(`http://127.0.0.1:${port}/sync`);
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.headers.get("x-handled"), "1");
    assert.deepStrictEqual(await r.json(), { status: "error", message: "NOPE" });
    await close();
  });

  it("a single responding error middleware still works (no regression)", async () => {
    const app = express();
    app.get("/one", () => { throw new CustomError("SINGLE", 422); });
    app.use((err, req, res, next) => res.status(err.statusCode).json({ e: err.message }));
    const { close, port } = await listen(app);
    const r = await fetch(`http://127.0.0.1:${port}/one`);
    assert.strictEqual(r.status, 422);
    assert.deepStrictEqual(await r.json(), { e: "SINGLE" });
    await close();
  });

  it("chain that never responds falls back to the error's own status (not blanket 500)", async () => {
    const app = express();
    app.get("/defer", () => { throw new CustomError("STILL_DEFERRING", 418); });
    app.use((err, req, res, next) => next(err)); // both defer, none respond
    app.use((err, req, res, next) => next(err));
    const { close, port } = await listen(app);
    const r = await fetch(`http://127.0.0.1:${port}/defer`);
    assert.strictEqual(r.status, 418, "falls back to err.statusCode");
    await close();
  });

  it("expressLane forces the Express lane even when the handler is wrapped by an APM", async () => {
    const app = express();
    const handler = expressLane((req, res) => res.json({ lane: "express" }));
    // Simulate Sentry/OTel wrapping: a new fn whose __original points back to the marked handler.
    const wrapped = function patched(...args) { return handler.apply(this, args); };
    wrapped.__original = handler;
    app.get("/wrapped", wrapped);
    const f = fast(app, { experimental: { diagnostics: true } });
    await f.listen({ port: 0, host: "127.0.0.1" });
    const port = f.server.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/wrapped`);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(await r.json(), { lane: "express" });
    await f.close();
  });
});
