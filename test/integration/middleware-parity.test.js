/**
 * Express middleware parity on fast(): common "batteries" must behave as on plain Express.
 * Run: node --test test/integration/middleware-parity.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { fast } from "../../dist/index.js";
import express from "express";
import helmet from "helmet";

async function listen(app) {
  const fastify = fast(app);
  await fastify.listen({ port: 0, host: "127.0.0.1" });
  return { fastify, port: fastify.server.address().port };
}

describe("middleware parity on fast()", () => {
  it("custom auth middleware sets req.user; isolated across concurrent requests", async () => {
    const app = express();
    app.use((req, res, next) => {
      // Simulate auth deriving user from a header, with an await (token verify, DB lookup).
      const id = req.headers["x-user"];
      Promise.resolve().then(() => {
        req.user = { id };
        next();
      });
    });
    app.get("/me", async (req, res) => {
      await new Promise((r) => setTimeout(r, 5));
      res.json({ id: req.user?.id });
    });

    const { fastify, port } = await listen(app);
    const N = 25;
    const results = await Promise.all(
      Array.from({ length: N }, async (_, i) => {
        const res = await fetch(`http://127.0.0.1:${port}/me`, { headers: { "x-user": String(i) } });
        return { i, body: await res.json().catch(() => null) };
      }),
    );
    for (const r of results) {
      assert.ok(r.body && r.body.id === String(r.i), `req ${r.i}: req.user cross-talk (${JSON.stringify(r.body)})`);
    }
    await fastify.close();
  });

  it("helmet sets security headers on the Fastify lane", async () => {
    const app = express();
    app.use(helmet());
    app.get("/secure", (req, res) => res.json({ ok: true }));

    const { fastify, port } = await listen(app);
    const res = await fetch(`http://127.0.0.1:${port}/secure`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("x-content-type-options"), "nosniff");
    assert.ok(res.headers.get("x-dns-prefetch-control"), "helmet header present");
    assert.deepStrictEqual(await res.json(), { ok: true });
    await fastify.close();
  });

  it("express.json() parses body on fast()", async () => {
    const app = express();
    app.use(express.json());
    app.post("/echo", (req, res) => res.json({ got: req.body }));

    const { fastify, port } = await listen(app);
    const res = await fetch(`http://127.0.0.1:${port}/echo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a: 1, b: "two" }),
    });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { got: { a: 1, b: "two" } });
    await fastify.close();
  });

  it("res.cookie writes Set-Cookie and req.cookies parses incoming cookies", async () => {
    const app = express();
    app.get("/set", (req, res) => {
      res.cookie("sid", "abc123", { httpOnly: true, path: "/" });
      res.json({ ok: true });
    });
    app.get("/read", (req, res) => res.json({ cookies: req.cookies }));

    const { fastify, port } = await listen(app);
    const setRes = await fetch(`http://127.0.0.1:${port}/set`);
    const setCookie = setRes.headers.get("set-cookie");
    assert.ok(setCookie && setCookie.includes("sid=abc123"), `Set-Cookie present: ${setCookie}`);
    assert.ok(setCookie.includes("HttpOnly"), "HttpOnly flag present");

    const readRes = await fetch(`http://127.0.0.1:${port}/read`, {
      headers: { Cookie: "sid=abc123; theme=dark" },
    });
    assert.deepStrictEqual(await readRes.json(), { cookies: { sid: "abc123", theme: "dark" } });
    await fastify.close();
  });
});
