/**
 * server.listen() / fastApp.listen() port handling. process.env.PORT is a STRING, so a string
 * port must bind to that actual port (Node/Express coerce; we must too) — not fall back to a
 * random port.
 * Run: node --test test/integration/listen.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import net from "node:net";
import { fast } from "../../dist/index.js";
import express from "express";

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
    srv.on("error", reject);
  });
}

describe("fast() server.listen port handling", () => {
  it("server.listen(STRING_PORT, cb) binds the actual port (process.env.PORT is a string)", async () => {
    const port = await freePort();
    const app = express();
    app.get("/ping", (req, res) => res.json({ pong: true }));
    const fastApp = fast(app);

    await new Promise((resolve, reject) => {
      // pass the port as a STRING, exactly like process.env.PORT
      fastApp.server.listen(String(port), (err) => (err ? reject(err) : resolve()));
    });

    const bound = fastApp.server.address();
    assert.strictEqual(bound.port, port, `expected to bind ${port}, bound ${bound.port}`);
    const r = await fetch(`http://127.0.0.1:${port}/ping`);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(await r.json(), { pong: true });
    await fastApp.close();
  });

  it("server.listen({ port: STRING }, cb) also coerces", async () => {
    const port = await freePort();
    const app = express();
    app.get("/p", (req, res) => res.json({ ok: true }));
    const fastApp = fast(app);
    // server.listen() returns the server (Node API), not a promise — wait via the callback.
    await new Promise((resolve, reject) =>
      fastApp.server.listen({ port: String(port), host: "127.0.0.1" }, (err) =>
        err ? reject(err) : resolve(),
      ),
    );
    assert.strictEqual(fastApp.server.address().port, port);
    const r = await fetch(`http://127.0.0.1:${port}/p`);
    assert.deepStrictEqual(await r.json(), { ok: true });
    await fastApp.close();
  });

  it("server.listen(NUMBER, cb) still works", async () => {
    const port = await freePort();
    const app = express();
    app.get("/n", (req, res) => res.json({ n: 1 }));
    const fastApp = fast(app);
    await new Promise((resolve, reject) =>
      fastApp.server.listen(port, (err) => (err ? reject(err) : resolve())),
    );
    assert.strictEqual(fastApp.server.address().port, port);
    await fastApp.close();
  });
});
