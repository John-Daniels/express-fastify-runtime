/**
 * Express 4 compatibility. Runs only when the installed Express is v4 (skipped under v5 so the
 * normal suite stays green); CI installs express@4 in a matrix job to exercise it.
 * Run (with express@4 installed): node --test test/compat/express4.test.js
 */

import "../../dist/index.js"; // patch router layer (Express 4 bundled layer + Express 5 router)
import { describe, it } from "node:test";
import assert from "node:assert";
import express from "express";
import { createRequire } from "node:module";
import { fast } from "../../dist/index.js";

const major = Number(createRequire(import.meta.url)("express/package.json").version.split(".")[0]);
const onlyV4 = { skip: major !== 4 ? `installed Express is v${major}, not v4` : false };

describe("Express 4 compatibility (fast())", () => {
  it("routes, mounted router.use(path,fn), error middleware run on the Fastify lane; 404 falls through", onlyV4, async () => {
    const app = express();
    app.use((req, res, next) => { req.gg = "g"; next(); });

    const router = express.Router();
    router.use("/sub", (req, res, next) => { req.viaSub = true; next(); });
    router.get("/sub/item", (req, res) => res.json({ item: true, viaSub: req.viaSub === true, gg: req.gg }));
    app.use("/api", router);

    app.get("/hello/:id", (req, res) => res.json({ id: req.params.id, gg: req.gg }));
    app.get("/boom", (req, res, next) => next(new Error("e4-error")));
    app.use((err, req, res, next) => res.status(500).json({ error: err.message }));

    const fastApp = fast(app);
    await fastApp.listen({ port: 0, host: "127.0.0.1" });
    const port = fastApp.server.address().port;
    const base = `http://127.0.0.1:${port}`;

    assert.deepStrictEqual(await (await fetch(`${base}/hello/7`)).json(), { id: "7", gg: "g" });
    assert.deepStrictEqual(await (await fetch(`${base}/api/sub/item`)).json(), { item: true, viaSub: true, gg: "g" });

    const boom = await fetch(`${base}/boom`);
    assert.strictEqual(boom.status, 500);
    assert.deepStrictEqual(await boom.json(), { error: "e4-error" });

    assert.strictEqual((await fetch(`${base}/nope`)).status, 404);

    await fastApp.close();
  });

  it("express.json() body works on the Express-lane fallback (writable body, no readonly throw)", onlyV4, async () => {
    // Express 4's body-parser THROWS "Cannot assign to read only property 'body'" if we attach the
    // Fastify-parsed body as read-only and then real express.json() tries to assign req.body.
    // (Express 5 silently no-ops, so this regression is only observable under v4.) A RegExp mount
    // is unflattenable, forcing the whole app onto the Express lane where real express.json() runs.
    const app = express();
    app.use(/^\/.*/, (req, res, next) => next()); // force the Express lane
    app.use(express.json());
    app.post("/echo", (req, res) => res.json({ got: req.body }));

    const fastApp = fast(app);
    await fastApp.listen({ port: 0, host: "127.0.0.1" });
    const port = fastApp.server.address().port;

    const r = await fetch(`http://127.0.0.1:${port}/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: 1, b: "two" }),
    });
    assert.strictEqual(r.status, 200, `expected 200, got ${r.status}`);
    assert.deepStrictEqual(await r.json(), { got: { a: 1, b: "two" } });
    await fastApp.close();
  });
});
