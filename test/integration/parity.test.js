/**
 * Express response-behavior parity on fast(): send variants, redirect, 204, streaming/SSE,
 * large-payload echo, and 404 fall-through to the Express lane.
 * Run: node --test test/integration/parity.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import http from "node:http";
import { fast } from "../../dist/index.js";
import express from "express";

async function listen(app) {
  const f = fast(app);
  await f.listen({ port: 0, host: "127.0.0.1" });
  return { close: () => f.close(), port: f.server.address().port };
}

describe("response parity on fast()", () => {
  it("res.send(string) sends text/html; res.send(Buffer) sends bytes; res.send(object) sends JSON", async () => {
    const app = express();
    app.get("/html", (req, res) => res.send("<h1>hi</h1>"));
    app.get("/buf", (req, res) => res.send(Buffer.from("rawbytes")));
    app.get("/obj", (req, res) => res.send({ a: 1 }));
    const { close, port } = await listen(app);

    const html = await fetch(`http://127.0.0.1:${port}/html`);
    assert.match(html.headers.get("content-type") || "", /text\/html/);
    assert.strictEqual(await html.text(), "<h1>hi</h1>");

    const buf = await fetch(`http://127.0.0.1:${port}/buf`);
    assert.strictEqual(await buf.text(), "rawbytes");

    const obj = await fetch(`http://127.0.0.1:${port}/obj`);
    assert.match(obj.headers.get("content-type") || "", /application\/json/);
    assert.deepStrictEqual(await obj.json(), { a: 1 });
    await close();
  });

  it("res.status(204).end() sends an empty 204", async () => {
    const app = express();
    app.get("/nc", (req, res) => res.status(204).end());
    const { close, port } = await listen(app);
    const r = await fetch(`http://127.0.0.1:${port}/nc`);
    assert.strictEqual(r.status, 204);
    assert.strictEqual(await r.text(), "");
    await close();
  });

  it("res.redirect sets status + Location (default 302 and explicit 301)", async () => {
    const app = express();
    app.get("/r", (req, res) => res.redirect("/dest"));
    app.get("/r301", (req, res) => res.redirect(301, "/perm"));
    const { close, port } = await listen(app);

    const r = await fetch(`http://127.0.0.1:${port}/r`, { redirect: "manual" });
    assert.strictEqual(r.status, 302);
    assert.strictEqual(r.headers.get("location"), "/dest");

    const r301 = await fetch(`http://127.0.0.1:${port}/r301`, { redirect: "manual" });
    assert.strictEqual(r301.status, 301);
    assert.strictEqual(r301.headers.get("location"), "/perm");
    await close();
  });

  it("streaming / SSE via res.write + res.end works (res.flushHeaders, multiple chunks)", async () => {
    const app = express();
    app.get("/sse", (req, res) => {
      res.setHeader("Content-Type", "text/event-stream");
      res.flushHeaders();
      res.write("data: one\n\n");
      res.write("data: two\n\n");
      res.end();
    });
    const { close, port } = await listen(app);
    const r = await fetch(`http://127.0.0.1:${port}/sse`);
    assert.match(r.headers.get("content-type") || "", /text\/event-stream/);
    assert.strictEqual(await r.text(), "data: one\n\ndata: two\n\n");
    await close();
  });

  it("large JSON payload (1MB) echoes back correctly", async () => {
    const app = express();
    app.use(express.json({ limit: "10mb" }));
    app.post("/echo", (req, res) => res.json({ len: req.body.s.length }));
    const { close, port } = await listen(app);
    const s = "x".repeat(1024 * 1024);
    const r = await fetch(`http://127.0.0.1:${port}/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ s }),
    });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(await r.json(), { len: s.length });
    await close();
  });

  it("unmatched route falls through to the Express lane (Express 404)", async () => {
    const app = express();
    app.get("/known", (req, res) => res.json({ ok: true }));
    const { close, port } = await listen(app);
    const known = await fetch(`http://127.0.0.1:${port}/known`);
    assert.strictEqual(known.status, 200);
    const unknown = await fetch(`http://127.0.0.1:${port}/nope`);
    assert.strictEqual(unknown.status, 404);
    await close();
  });

  it("streaming response is not corrupted under concurrency", async () => {
    const app = express();
    app.get("/stream/:id", async (req, res) => {
      const id = req.params.id;
      res.setHeader("Content-Type", "text/plain");
      res.write(`a:${id};`);
      await new Promise((r) => setTimeout(r, 5));
      res.write(`b:${id}`);
      res.end();
    });
    const { close, port } = await listen(app);
    const N = 20;
    const out = await Promise.all(
      Array.from({ length: N }, async (_, i) => {
        const r = await fetch(`http://127.0.0.1:${port}/stream/${i}`);
        return { i, text: await r.text() };
      }),
    );
    for (const o of out) assert.strictEqual(o.text, `a:${o.i};b:${o.i}`, `stream ${o.i} cross-talk`);
    await close();
  });
});
