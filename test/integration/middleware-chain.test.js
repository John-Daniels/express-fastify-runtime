/**
 * Continuation-based middleware chain on the Fastify lane: middleware drives the chain via
 * next() no matter HOW it's called (sync, async/await, or a detached callback/microtask) — and
 * a middleware that responds without next() stops the chain. Matches Express's router.
 * Run: node --test test/integration/middleware-chain.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { fast } from "../../dist/index.js";
import express from "express";

async function listen(app) {
  const f = fast(app);
  await f.listen({ port: 0, host: "127.0.0.1" });
  return { close: () => f.close(), port: f.server.address().port };
}

describe("middleware chain (continuation-based)", () => {
  it("callback-style next() (setTimeout) runs subsequent middleware + handler in order", async () => {
    const app = express();
    const order = [];
    app.use((req, res, next) => { setTimeout(() => { order.push("a"); next(); }, 5); });
    app.use((req, res, next) => { process.nextTick(() => { order.push("b"); next(); }); });
    app.get("/x", (req, res) => { order.push("h"); res.json({ order }); });
    const { close, port } = await listen(app);
    assert.deepStrictEqual(await (await fetch(`http://127.0.0.1:${port}/x`)).json(), { order: ["a", "b", "h"] });
    await close();
  });

  it("detached-promise next() (Promise.resolve().then(next), not returned) still advances", async () => {
    const app = express();
    const order = [];
    app.use((req, res, next) => { Promise.resolve().then(() => { order.push("p"); next(); }); });
    app.use((req, res, next) => { order.push("s"); next(); });
    app.get("/y", (req, res) => { order.push("h"); res.json({ order }); });
    const { close, port } = await listen(app);
    assert.deepStrictEqual(await (await fetch(`http://127.0.0.1:${port}/y`)).json(), { order: ["p", "s", "h"] });
    await close();
  });

  it("route-level middleware with callback next() runs the final handler", async () => {
    const app = express();
    const order = [];
    const mw = (req, res, next) => setTimeout(() => { order.push("rm"); next(); }, 3);
    app.get("/z", mw, (req, res) => { order.push("h"); res.json({ order }); });
    const { close, port } = await listen(app);
    assert.deepStrictEqual(await (await fetch(`http://127.0.0.1:${port}/z`)).json(), { order: ["rm", "h"] });
    await close();
  });

  it("middleware that responds WITHOUT next() stops the chain (handler not called)", async () => {
    const app = express();
    let handlerRan = false;
    app.use((req, res, next) => {
      if (req.headers["x-block"]) return res.status(403).json({ blocked: true });
      next();
    });
    app.get("/g", (req, res) => { handlerRan = true; res.json({ ok: true }); });
    const { close, port } = await listen(app);

    const blocked = await fetch(`http://127.0.0.1:${port}/g`, { headers: { "x-block": "1" } });
    assert.strictEqual(blocked.status, 403);
    assert.deepStrictEqual(await blocked.json(), { blocked: true });
    assert.strictEqual(handlerRan, false, "handler must not run when middleware responded");

    const ok = await fetch(`http://127.0.0.1:${port}/g`);
    assert.deepStrictEqual(await ok.json(), { ok: true });
    await close();
  });

  it("next(err) from a detached callback reaches the error middleware", async () => {
    const app = express();
    app.get("/e", (req, res, next) => setTimeout(() => next(new Error("late-boom")), 3));
    app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
    const { close, port } = await listen(app);
    const r = await fetch(`http://127.0.0.1:${port}/e`);
    assert.strictEqual(r.status, 500);
    assert.deepStrictEqual(await r.json(), { error: "late-boom" });
    await close();
  });

  it("chain is isolated under concurrency with async middleware", async () => {
    const app = express();
    app.use((req, res, next) => setTimeout(() => { req.tag = req.headers["x-tag"]; next(); }, 4));
    app.get("/c", (req, res) => res.json({ tag: req.tag }));
    const { close, port } = await listen(app);
    const N = 20;
    const out = await Promise.all(
      Array.from({ length: N }, async (_, i) => {
        const r = await fetch(`http://127.0.0.1:${port}/c`, { headers: { "x-tag": String(i) } });
        return { i, body: await r.json() };
      }),
    );
    for (const o of out) assert.strictEqual(o.body.tag, String(o.i), `req ${o.i} cross-talk`);
    await close();
  });
});
