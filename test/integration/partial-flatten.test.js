/**
 * One un-flattenable router must NOT sink the whole app to the Express lane.
 *
 * A sub-router mounted with (or containing) an array/RegExp path can't be flattened. Previously
 * flattenRouter returned null for that router and the failure propagated to the root, so fast()
 * compiled ZERO routes and every request fell to the Express lane (this is exactly what happened to
 * a real 49-router app: one `router.use(['/a','/b'], ...)` sank everything).
 *
 * Now such a router falls back to the Express lane AS A UNIT — its routes still work, with their
 * guard middleware intact (via the real Express app) — while sibling routers compile to the Fastify
 * lane.
 * Run: node --test test/integration/partial-flatten.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { fast } from "../../dist/index.js";
import express from "express";

/** Run fn() while collecting console.log lines (diagnostics logs lane decisions there). */
async function withCapturedLogs(fn) {
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.map(String).join(" "));
  try {
    await fn(logs);
  } finally {
    console.log = orig;
  }
  return logs;
}

describe("partial flatten (one bad router doesn't sink the app)", () => {
  it("array-mount sub-router → Express lane (guard intact); sibling → Fastify lane", async () => {
    const app = express();

    // Good sibling router — must compile to the Fastify lane.
    const good = express.Router();
    good.get("/ping", (req, res) => res.json({ pong: true }));
    app.use("/api", good);

    // Bad router: array mount path on a guard middleware → can't flatten → Express lane as a unit.
    const bad = express.Router();
    bad.use(["/sup", "/watch"], (req, res, next) => {
      if (req.headers["x-key"] !== "secret") return res.status(401).json({ error: "no key" });
      next();
    });
    bad.get("/sup/list", (req, res) => res.json({ list: [] }));
    app.use("/v1", bad);

    let f;
    const buildLogs = await withCapturedLogs(async () => {
      f = fast(app, { experimental: { diagnostics: true } });
    });
    assert.ok(
      !buildLogs.some((l) => l.includes("No routes compiled")),
      "the good sibling route must compile — app must NOT fall entirely to the Express lane",
    );

    await f.listen({ port: 0, host: "127.0.0.1" });
    const port = f.server.address().port;

    const reqLogs = await withCapturedLogs(async () => {
      const ping = await fetch(`http://127.0.0.1:${port}/api/ping`);
      assert.strictEqual(ping.status, 200);
      assert.deepStrictEqual(await ping.json(), { pong: true });

      // Bad router's route still works — and its guard runs (proves real Express ran the chain).
      const noKey = await fetch(`http://127.0.0.1:${port}/v1/sup/list`);
      assert.strictEqual(noKey.status, 401, "guard middleware must run on the Express-lane fallback");

      const withKey = await fetch(`http://127.0.0.1:${port}/v1/sup/list`, {
        headers: { "x-key": "secret" },
      });
      assert.strictEqual(withKey.status, 200);
      assert.deepStrictEqual(await withKey.json(), { list: [] });
    });

    assert.ok(
      reqLogs.some((l) => l.includes("Fastify lane") && l.includes("/api/ping")),
      "sibling route should be served on the Fastify lane",
    );
    assert.ok(
      reqLogs.some((l) => l.includes("Express lane")),
      "the array-mount router's route should fall to the Express lane",
    );

    await f.close();
  });

  it("RegExp-mount sub-router also falls back without sinking siblings", async () => {
    const app = express();

    const good = express.Router();
    good.get("/ok", (req, res) => res.json({ ok: true }));
    app.use("/g", good);

    const bad = express.Router();
    bad.use(/^\/x/, (req, res, next) => next()); // RegExp middleware path → unflattenable
    bad.get("/x/y", (req, res) => res.json({ y: 1 }));
    app.use("/b", bad);

    const f = fast(app);
    await f.listen({ port: 0, host: "127.0.0.1" });
    const port = f.server.address().port;

    assert.strictEqual((await fetch(`http://127.0.0.1:${port}/g/ok`)).status, 200);
    const y = await fetch(`http://127.0.0.1:${port}/b/x/y`);
    assert.strictEqual(y.status, 200);
    assert.deepStrictEqual(await y.json(), { y: 1 });

    await f.close();
  });
});
