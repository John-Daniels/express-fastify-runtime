/**
 * Instrumentation (OpenTelemetry / Sentry) wraps Express layer handlers, so a built-in like
 * `expressInit` ends up with handle.name === "patched" while layer.name stays "expressInit".
 * Express 4's expressInit reassigns req/res prototypes; if it runs on the Fastify lane it breaks
 * our adapter (helmet's res.setHeader then throws "Cannot set properties of undefined (setting
 * 'content-security-policy')"). We must skip it by layer.name, not handle.name.
 * Run: node --test test/integration/instrumentation.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { fast } from "../../dist/index.js";
import express from "express";
import helmet from "helmet";

/** Simulate an APM wrapping app router layers (like @opentelemetry/instrumentation-express). */
function wrapLayersLikeOtel(app) {
  const router = app._router || (() => { try { return app.router; } catch { return undefined; } })();
  if (!router || !Array.isArray(router.stack)) return 0;
  let wrapped = 0;
  for (const layer of router.stack) {
    if (typeof layer.handle === "function" && !layer.route) {
      const original = layer.handle;
      const patched = function patched(...args) { return original.apply(this, args); };
      layer.handle = patched; // handle.name === "patched"; Express keeps layer.name
      wrapped++;
    }
  }
  return wrapped;
}

describe("instrumented (wrapped) Express built-ins", () => {
  it("helmet works when expressInit/query handlers are wrapped (skip by layer.name)", async () => {
    const app = express();
    app.use(helmet());
    app.get("/", (_req, res) => res.send("ok"));
    wrapLayersLikeOtel(app); // simulate OTel/Sentry wrapping

    const fastApp = fast(app);
    await fastApp.listen({ port: 0, host: "127.0.0.1" });
    const port = fastApp.server.address().port;

    const r = await fetch(`http://127.0.0.1:${port}/`);
    const body = await r.text();
    assert.strictEqual(r.status, 200, `expected 200, got ${r.status} (${body})`);
    assert.ok(
      r.headers.get("content-security-policy"),
      "helmet CSP header must be set (expressInit must not run on the Fastify lane)",
    );
    assert.strictEqual(body, "ok");
    await fastApp.close();
  });

  it("wrapped express.json() is neutralized — POST body still parses (no 'argument stream' crash)", async () => {
    const app = express();
    app.use(express.json());
    app.post("/login", (req, res) => res.json({ got: req.body }));
    wrapLayersLikeOtel(app); // wrap json/expressInit/etc. so handle.name !== real name

    const fastApp = fast(app);
    await fastApp.listen({ port: 0, host: "127.0.0.1" });
    const port = fastApp.server.address().port;

    const r = await fetch(`http://127.0.0.1:${port}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "x" }),
    });
    const body = await r.json();
    assert.strictEqual(r.status, 200, `expected 200, got ${r.status}`);
    assert.deepStrictEqual(body, { got: { email: "a@b.com", password: "x" } });
    await fastApp.close();
  });
});
