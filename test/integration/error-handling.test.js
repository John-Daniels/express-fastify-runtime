/**
 * Express error-handling parity on the Fastify lane, for both fast() and createApp().
 * next(err), thrown errors, and async rejections must reach the Express 4-arg error middleware.
 * Run: node --test test/integration/error-handling.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { createApp, fast } from "../../dist/index.js";
import express from "express";

async function fastListen(app) {
  const f = fast(app);
  await f.listen({ port: 0, host: "127.0.0.1" });
  return { close: () => f.close(), port: f.server.address().port };
}
async function createAppListen(build) {
  const app = createApp();
  build(app);
  const server = await app.listen(0);
  return { close: () => server.close(), port: server.address().port };
}

describe("error handling on the Fastify lane — fast()", () => {
  it("next(err) reaches Express error middleware", async () => {
    const app = express();
    app.get("/fail", (req, res, next) => next(new Error("boom-next")));
    app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
    const { close, port } = await fastListen(app);
    const r = await fetch(`http://127.0.0.1:${port}/fail`);
    assert.strictEqual(r.status, 500);
    assert.deepStrictEqual(await r.json(), { error: "boom-next" });
    await close();
  });

  it("thrown (sync) error reaches Express error middleware", async () => {
    const app = express();
    app.get("/throw", () => { throw new Error("boom-throw"); });
    app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
    const { close, port } = await fastListen(app);
    const r = await fetch(`http://127.0.0.1:${port}/throw`);
    assert.strictEqual(r.status, 500);
    assert.deepStrictEqual(await r.json(), { error: "boom-throw" });
    await close();
  });

  it("async rejection reaches Express error middleware", async () => {
    const app = express();
    app.get("/async", async () => { await Promise.resolve(); throw new Error("boom-async"); });
    app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
    const { close, port } = await fastListen(app);
    const r = await fetch(`http://127.0.0.1:${port}/async`);
    assert.strictEqual(r.status, 500);
    assert.deepStrictEqual(await r.json(), { error: "boom-async" });
    await close();
  });

  it("error middleware does NOT run on the success path", async () => {
    let ranError = false;
    const app = express();
    app.get("/ok", (req, res) => res.json({ ok: true }));
    app.use((err, req, res, next) => { ranError = true; res.status(500).json({ error: err.message }); });
    const { close, port } = await fastListen(app);
    const r = await fetch(`http://127.0.0.1:${port}/ok`);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(await r.json(), { ok: true });
    assert.strictEqual(ranError, false, "error middleware must not run in the normal chain");
    await close();
  });
});

describe("error handling on the Fastify lane — createApp()", () => {
  it("next(err) reaches Express error middleware", async () => {
    const { close, port } = await createAppListen((app) => {
      app.get("/fail", (req, res, next) => next(new Error("boom-ca")));
      app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
    });
    const r = await fetch(`http://127.0.0.1:${port}/fail`);
    assert.strictEqual(r.status, 500);
    assert.deepStrictEqual(await r.json(), { error: "boom-ca" });
    await close();
  });

  it("thrown error reaches Express error middleware", async () => {
    const { close, port } = await createAppListen((app) => {
      app.get("/throw", () => { throw new Error("boom-ca-throw"); });
      app.use((err, req, res, next) => res.status(502).json({ error: err.message }));
    });
    const r = await fetch(`http://127.0.0.1:${port}/throw`);
    assert.strictEqual(r.status, 502);
    assert.deepStrictEqual(await r.json(), { error: "boom-ca-throw" });
    await close();
  });
});
