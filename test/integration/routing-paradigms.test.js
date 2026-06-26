/**
 * Express routing paradigms through fast(): wildcards, next('route'), app.param, mounted sub-apps,
 * and case/strict routing settings. Runs on both Express majors (wildcard syntax differs by major).
 * Run: node --test test/integration/routing-paradigms.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
import { fast } from "../../dist/index.js";
import express from "express";

const major = Number(createRequire(import.meta.url)("express/package.json").version.split(".")[0]);

async function listen(app) {
  const f = fast(app);
  await f.listen({ port: 0, host: "127.0.0.1" });
  return { close: () => f.close(), port: f.server.address().port };
}

describe("routing paradigms on fast()", () => {
  it("trailing wildcard matches and exposes the wildcard value where Express puts it", async () => {
    const app = express();
    // Express 4 uses bare `*` (→ req.params[0]); Express 5 names it (→ req.params.splat).
    const pattern = major >= 5 ? "/files/*splat" : "/files/*";
    app.get(pattern, (req, res) => {
      res.json({ w: req.params.splat ?? req.params[0] ?? null });
    });
    const { close, port } = await listen(app);
    const r = await fetch(`http://127.0.0.1:${port}/files/a/b`);
    assert.strictEqual(r.status, 200, "wildcard route must match (no startup crash, no 404)");
    const body = await r.json();
    // Express 5 splat is an array; we bridge the string form — accept either shape.
    const w = Array.isArray(body.w) ? body.w.join("/") : body.w;
    assert.strictEqual(w, "a/b", `wildcard value should be 'a/b', got ${JSON.stringify(body.w)}`);
    await close();
  });

  it("plain params still work unchanged", async () => {
    const app = express();
    app.get("/u/:a/:b", (req, res) => res.json({ a: req.params.a, b: req.params.b }));
    const { close, port } = await listen(app);
    assert.deepStrictEqual(
      await (await fetch(`http://127.0.0.1:${port}/u/1/2`)).json(),
      { a: "1", b: "2" },
    );
    await close();
  });

  it("next('route') skips to the next matching route (via Express lane), not a 500", async () => {
    const app = express();
    app.get("/x", (req, res, next) => next("route"));
    app.get("/x", (req, res) => res.json({ second: true }));
    const { close, port } = await listen(app);
    const r = await fetch(`http://127.0.0.1:${port}/x`);
    assert.strictEqual(r.status, 200, "next('route') must not 500");
    assert.deepStrictEqual(await r.json(), { second: true });
    await close();
  });

  it("app.param(name, fn) callback fires for routes using that param", async () => {
    const app = express();
    app.param("id", (req, res, next, id) => {
      req.loaded = `loaded:${id}`;
      next();
    });
    app.get("/item/:id", (req, res) => res.json({ v: req.loaded ?? null }));
    const { close, port } = await listen(app);
    assert.deepStrictEqual(
      await (await fetch(`http://127.0.0.1:${port}/item/7`)).json(),
      { v: "loaded:7" },
    );
    await close();
  });

  it("mounted sub-app (app.use('/s', express())) responds correctly", async () => {
    const app = express();
    const sub = express();
    sub.get("/hi", (req, res) => res.json({ sub: true }));
    app.use("/s", sub);
    // a sibling on the main app should still be fast-laned and work
    app.get("/main", (req, res) => res.json({ main: true }));
    const { close, port } = await listen(app);
    assert.deepStrictEqual(await (await fetch(`http://127.0.0.1:${port}/s/hi`)).json(), { sub: true });
    assert.deepStrictEqual(await (await fetch(`http://127.0.0.1:${port}/main`)).json(), { main: true });
    await close();
  });

  it("routing matches Express defaults: case-insensitive + trailing slash tolerant", async () => {
    const app = express();
    app.get("/foo", (req, res) => res.json({ ok: true }));
    const { close, port } = await listen(app);
    assert.strictEqual((await fetch(`http://127.0.0.1:${port}/FOO`)).status, 200, "case-insensitive by default");
    assert.strictEqual((await fetch(`http://127.0.0.1:${port}/foo/`)).status, 200, "trailing slash tolerant by default");
    await close();
  });
});
