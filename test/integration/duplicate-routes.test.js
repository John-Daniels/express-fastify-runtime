/**
 * Repeated Express route registrations for the same method+path are valid Express (the layers
 * chain via next()). Fastify forbids duplicate method+path, so such routes defer to the Express
 * lane where the real app runs every layer in order. Also covers stream body parsers
 * (express.urlencoded) which must run on the Express lane.
 * Run: node --test test/integration/duplicate-routes.test.js
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

describe("duplicate method+path route registrations", () => {
  it("two router.post('/x', ...) for the same path do not crash and run in order", async () => {
    const app = express();
    const router = express.Router();
    const order = [];
    router.post("/x", (req, res, next) => { order.push("a"); next(); });
    router.post("/x", (req, res) => { order.push("b"); res.json({ order }); });
    app.use("/api", router);

    const { close, port } = await listen(app);
    const r = await fetch(`http://127.0.0.1:${port}/api/x`, { method: "POST" });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(await r.json(), { order: ["a", "b"] });
    await close();
  });

  it("reported pattern: router.post(urlencoded) + router.post(handler) parses the body", async () => {
    const app = express();
    const router = express.Router();
    router.post("/whatsapp/incoming", express.urlencoded({ extended: false }));
    router.post("/whatsapp/incoming", (req, res) => res.json({ got: req.body }));
    app.use("/v1", router);

    const { close, port } = await listen(app);
    const r = await fetch(`http://127.0.0.1:${port}/v1/whatsapp/incoming`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "From=whatsapp%3A%2B123&Body=hello+world",
    });
    assert.strictEqual(r.status, 200, `expected 200, got ${r.status}`);
    assert.deepStrictEqual(await r.json(), { got: { From: "whatsapp:+123", Body: "hello world" } });
    await close();
  });

  it("single route with express.urlencoded(...) inline parses the body (Express lane)", async () => {
    const app = express();
    app.post("/form", express.urlencoded({ extended: false }), (req, res) => res.json({ got: req.body }));
    const { close, port } = await listen(app);
    const r = await fetch(`http://127.0.0.1:${port}/form`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "a=1&b=two",
    });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(await r.json(), { got: { a: "1", b: "two" } });
    await close();
  });

  it("app.all('/x') + app.post('/x') do not crash; POST runs the post handler", async () => {
    const app = express();
    const seen = [];
    app.all("/x", (req, res, next) => { seen.push("all"); next(); });
    app.post("/x", (req, res) => { seen.push("post"); res.json({ seen }); });
    app.get("/x", (req, res) => res.json({ method: "get", seen }));

    const { close, port } = await listen(app);
    const post = await fetch(`http://127.0.0.1:${port}/x`, { method: "POST" });
    assert.strictEqual(post.status, 200);
    assert.deepStrictEqual(await post.json(), { seen: ["all", "post"] });
    await close();
  });

  it("regression: a normal single route still runs on the Fastify lane", async () => {
    const logs = [];
    const orig = console.log;
    console.log = (...a) => logs.push(a.join(" "));
    try {
      const app = express();
      app.get("/solo", (req, res) => res.json({ ok: true }));
      const f = fast(app, { experimental: { diagnostics: true } });
      await f.listen({ port: 0, host: "127.0.0.1" });
      const port = f.server.address().port;
      const r = await fetch(`http://127.0.0.1:${port}/solo`);
      assert.deepStrictEqual(await r.json(), { ok: true });
      await f.close();
      assert.ok(
        logs.some((l) => l.includes("Fastify lane") && l.includes("/solo")),
        `expected /solo on Fastify lane; logs: ${logs.join(" | ")}`,
      );
    } finally {
      console.log = orig;
    }
  });
});
