/**
 * Middleware must be able to MODIFY Express req/res properties on the Fastify lane — trust-proxy
 * rewriting req.ip/protocol/hostname, cookie-parser setting req.cookies, custom auth setting
 * req.user, res.locals, etc. These used to be read-only getters on the adapter, so assignments
 * threw ("Cannot assign to read only property") in strict mode or were silently dropped. The
 * adapter is now a fully-mutable Express object; these mutations must stick and stay on the fast
 * lane (no fallback), isolated per request under concurrency.
 * Run: node --test test/integration/req-mutation.test.js
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

describe("middleware can mutate req/res on the Fastify lane", () => {
  it("trust-proxy-style and parser-style mutations stick (req.ip/protocol/hostname/host/cookies/headers)", async () => {
    "use strict"; // make read-only assignment failures throw, like Express 4's body-parser
    const app = express();
    app.use((req, res, next) => {
      // these are derived getters in Express — middleware routinely overwrites them
      req.ip = "203.0.113.7";
      req.ips = ["203.0.113.7", "10.0.0.1"];
      req.protocol = "https"; // → req.secure should follow
      req.hostname = "api.internal";
      req.host = "api.internal:8443";
      req.cookies = { sid: "abc" }; // cookie-parser
      req.signedCookies = { token: "t" };
      req.headers["x-trace"] = "trace-123"; // mutate the headers object
      req.method = "PATCH"; // unusual but legal
      req.user = { id: "u1", role: "admin" }; // arbitrary custom prop
      res.locals.requestId = "rid-9";
      next();
    });
    app.get("/probe", (req, res) => {
      res.json({
        ip: req.ip,
        ips: req.ips,
        protocol: req.protocol,
        secure: req.secure, // derived from the overwritten protocol
        hostname: req.hostname,
        host: req.host,
        cookies: req.cookies,
        signedCookies: req.signedCookies,
        trace: req.headers["x-trace"],
        method: req.method,
        user: req.user,
        requestId: res.locals.requestId,
      });
    });

    const { close, port } = await listen(app);
    const r = await fetch(`http://127.0.0.1:${port}/probe`);
    assert.strictEqual(r.status, 200, "must not 500 on read-only assignment");
    assert.deepStrictEqual(await r.json(), {
      ip: "203.0.113.7",
      ips: ["203.0.113.7", "10.0.0.1"],
      protocol: "https",
      secure: true,
      hostname: "api.internal",
      host: "api.internal:8443",
      cookies: { sid: "abc" },
      signedCookies: { token: "t" },
      trace: "trace-123",
      method: "PATCH",
      user: { id: "u1", role: "admin" },
      requestId: "rid-9",
    });
    await close();
  });

  it("derived getters still compute live when NOT overridden (req.path follows req.url)", async () => {
    const app = express();
    app.use((req, res, next) => {
      // a rewrite middleware changes the url; req.path must reflect the new url
      req.url = "/rewritten?x=1";
      next();
    });
    app.get("/orig", (req, res) => res.json({ path: req.path, secure: req.secure }));
    const { close, port } = await listen(app);
    const r = await fetch(`http://127.0.0.1:${port}/orig`);
    assert.deepStrictEqual(await r.json(), { path: "/rewritten", secure: false });
    await close();
  });

  it("mutations are isolated per request under concurrency (no cross-talk)", async () => {
    const app = express();
    app.use((req, res, next) => {
      req.user = { id: req.headers["x-id"] };
      req.ip = `10.0.0.${req.headers["x-id"]}`;
      next();
    });
    app.get("/who", (req, res) => res.json({ id: req.user.id, ip: req.ip }));
    const { close, port } = await listen(app);
    const N = 30;
    const out = await Promise.all(
      Array.from({ length: N }, async (_, i) => {
        const r = await fetch(`http://127.0.0.1:${port}/who`, { headers: { "x-id": String(i) } });
        return { i, body: await r.json() };
      }),
    );
    for (const o of out) {
      assert.strictEqual(o.body.id, String(o.i), `req ${o.i}: user.id cross-talk`);
      assert.strictEqual(o.body.ip, `10.0.0.${o.i}`, `req ${o.i}: ip cross-talk`);
    }
    await close();
  });
});
