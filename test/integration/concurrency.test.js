/**
 * Concurrency correctness: fast() must NOT share per-request state across concurrent
 * in-flight requests. Regression tests for the shared-adapter bug where a single
 * mutated req/res object corrupted concurrent ASYNC handlers (empty/scrambled bodies)
 * and broke morgan logging.
 * Run: node --test test/integration/concurrency.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import http from "node:http";
import { fast } from "../../dist/index.js";
import express from "express";
import morgan from "morgan";

async function listen(app) {
  const fastify = fast(app);
  await fastify.listen({ port: 0, host: "127.0.0.1" });
  const addr = fastify.server.address();
  return { fastify, port: addr.port };
}

describe("fast() concurrency isolation", () => {
  it("concurrent ASYNC handlers each return their OWN params/url/body (no cross-talk)", async () => {
    const app = express();
    app.get("/echo/:id", async (req, res) => {
      const id = req.params.id;
      // Yield the event loop (smaller ids wait longer) to force request interleaving.
      await new Promise((r) => setTimeout(r, 5 + (Number(id) % 7)));
      res.json({ requested: id, sawParams: req.params.id, url: req.url });
    });

    const { fastify, port } = await listen(app);
    const N = 40;
    const results = await Promise.all(
      Array.from({ length: N }, async (_, i) => {
        const res = await fetch(`http://127.0.0.1:${port}/echo/${i}`);
        const text = await res.text();
        let body = null;
        try {
          body = JSON.parse(text);
        } catch {
          /* leave null */
        }
        return { i, status: res.status, text, body };
      }),
    );

    for (const r of results) {
      assert.strictEqual(r.status, 200, `req ${r.i}: status (body="${r.text}")`);
      assert.ok(r.body, `req ${r.i}: empty/invalid body "${r.text}"`);
      assert.strictEqual(r.body.requested, String(r.i), `req ${r.i}: requested`);
      assert.strictEqual(r.body.sawParams, String(r.i), `req ${r.i}: req.params cross-talk`);
      assert.strictEqual(r.body.url, `/echo/${r.i}`, `req ${r.i}: req.url cross-talk`);
    }

    await fastify.close();
  });

  it("concurrent requests get distinct status codes, headers, and bodies", async () => {
    const app = express();
    app.get("/item/:n", async (req, res) => {
      const n = Number(req.params.n);
      await new Promise((r) => setTimeout(r, 3 + (n % 5)));
      res.status(200 + (n % 3)) // 200, 201, 202
        .set("X-Item", String(n))
        .json({ n });
    });

    const { fastify, port } = await listen(app);
    const N = 30;
    const results = await Promise.all(
      Array.from({ length: N }, async (_, i) => {
        const res = await fetch(`http://127.0.0.1:${port}/item/${i}`);
        const body = await res.json().catch(() => null);
        return { i, status: res.status, header: res.headers.get("x-item"), body };
      }),
    );

    for (const r of results) {
      assert.strictEqual(r.status, 200 + (r.i % 3), `req ${r.i}: status`);
      assert.strictEqual(r.header, String(r.i), `req ${r.i}: X-Item header cross-talk`);
      assert.ok(r.body && r.body.n === r.i, `req ${r.i}: body cross-talk`);
    }

    await fastify.close();
  });

  it("res.locals is isolated per concurrent request", async () => {
    const app = express();
    app.use((req, res, next) => {
      res.locals.id = req.headers["x-id"];
      next();
    });
    app.get("/locals", async (req, res) => {
      await new Promise((r) => setTimeout(r, 5));
      res.json({ id: res.locals.id });
    });

    const { fastify, port } = await listen(app);
    const N = 25;
    const results = await Promise.all(
      Array.from({ length: N }, async (_, i) => {
        const res = await fetch(`http://127.0.0.1:${port}/locals`, {
          headers: { "x-id": String(i) },
        });
        return { i, body: await res.json().catch(() => null) };
      }),
    );
    for (const r of results) {
      assert.ok(r.body && r.body.id === String(r.i), `req ${r.i}: res.locals cross-talk (${JSON.stringify(r.body)})`);
    }
    await fastify.close();
  });

  it("morgan logs one correct line per request under CONCURRENT async load (keep-alive)", async () => {
    const logs = [];
    const stream = { write: (line) => logs.push(line.trim()) };
    const app = express();
    app.use(morgan("tiny", { stream }));
    app.get("/log/:id", async (req, res) => {
      await new Promise((r) => setTimeout(r, 3 + (Number(req.params.id) % 5)));
      res.status(200).json({ id: req.params.id });
    });

    const { fastify, port } = await listen(app);
    const agent = new http.Agent({ keepAlive: true, maxSockets: 8 });
    const doRequest = (id) =>
      new Promise((resolve, reject) => {
        const req = http.request(
          { host: "127.0.0.1", port, path: `/log/${id}`, agent },
          (res) => {
            res.on("data", () => {});
            res.on("end", resolve);
          },
        );
        req.on("error", reject);
        req.end();
      });

    const N = 20;
    await Promise.all(Array.from({ length: N }, (_, i) => doRequest(i)));

    // Drain so the double-setImmediate finish emits run for every request.
    for (let k = 0; k < 5; k++) await new Promise((r) => setImmediate(r));

    agent.destroy();
    await fastify.close();

    assert.strictEqual(logs.length, N, `expected ${N} morgan lines, got ${logs.length}`);
    for (const line of logs) {
      assert.ok(
        line.includes("GET") && line.includes("/log/") && line.includes("200"),
        `morgan line should be a well-formed GET /log/.. 200: "${line}"`,
      );
      assert.ok(!line.includes(" - - ms - -"), `morgan line missing status/time: "${line}"`);
      assert.ok(/\d+\.?\d*\s*ms/.test(line), `morgan line missing response time: "${line}"`);
    }
    // Every requested id 0..N-1 should appear exactly once across the log lines.
    const seen = logs.map((l) => l.match(/\/log\/(\d+)/)?.[1]).filter((x) => x != null).sort((a, b) => a - b);
    assert.deepStrictEqual(
      seen,
      Array.from({ length: N }, (_, i) => String(i)).sort((a, b) => a - b),
      "each request id should be logged exactly once (no duplicates/missing from shared state)",
    );
  });
});
