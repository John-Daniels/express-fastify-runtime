/**
 * Multipart uploads (multer) through fast(). Multipart MUST run on the Express lane — Fastify has no
 * multipart content-type parser, so a multipart route that wrongly compiles onto the Fastify lane is
 * rejected with 415 FST_ERR_CTP_INVALID_MEDIA_TYPE before multer ever runs.
 *
 * Regression guard: an APM (Sentry/OpenTelemetry) replaces layer.handle with a wrapper, so
 * handle.name becomes "patched" and multer is invisible to source/name detection. Express keeps the
 * ORIGINAL name on the layer, so detection must use layer.name (see utils/detect.isExpressRequiredName).
 * Run: node --test test/integration/uploads.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { fast } from "../../dist/index.js";
import express from "express";
import multer from "multer";

async function listen(app) {
  const f = fast(app);
  await f.listen({ port: 0, host: "127.0.0.1" });
  return { close: () => f.close(), port: f.server.address().port };
}

function form() {
  const fd = new FormData();
  fd.append("image", new Blob(["poa-file-bytes"], { type: "application/octet-stream" }), "poa.bin");
  fd.append("note", "hello");
  return fd;
}

/** Mimic Sentry/OTel: replace layer.handle with a wrapper AFTER registration (layer.name survives). */
function wrapHandlersLikeOtel(app) {
  const router = app._router || (() => { try { return app.router; } catch { return undefined; } })();
  for (const layer of router?.stack ?? []) {
    if (!layer.route) continue;
    for (const sub of layer.route.stack) {
      const original = sub.handle;
      sub.handle = function patched(...args) { return original.apply(this, args); }; // no __original
    }
  }
}

describe("multipart uploads (multer) on fast()", () => {
  it("plain multer route receives the file (Express lane, not 415)", async () => {
    const app = express();
    const upload = multer({ storage: multer.memoryStorage() });
    app.post("/up", upload.single("image"), (req, res) =>
      res.json({ file: req.file?.originalname, note: req.body?.note }),
    );
    const { close, port } = await listen(app);
    const r = await fetch(`http://127.0.0.1:${port}/up`, { method: "POST", body: form() });
    assert.notStrictEqual(r.status, 415, "multipart must not be rejected with 415");
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(await r.json(), { file: "poa.bin", note: "hello" });
    await close();
  });

  it("APM-wrapped multer (handle.name='patched') still runs on the Express lane — no 415", async () => {
    const app = express();
    const upload = multer({ storage: multer.memoryStorage() });
    app.post("/up", upload.single("image"), (req, res) =>
      res.json({ file: req.file?.originalname }),
    );
    wrapHandlersLikeOtel(app); // Sentry/OTel-style: hides multer from handle-based detection

    const { close, port } = await listen(app);
    const r = await fetch(`http://127.0.0.1:${port}/up`, { method: "POST", body: form() });
    assert.notStrictEqual(r.status, 415, "wrapped multer must still reach the Express lane");
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(await r.json(), { file: "poa.bin" });
    await close();
  });

  it("APM-wrapped multer mounted via app.use() still runs on the Express lane — no 415", async () => {
    const app = express();
    const upload = multer({ storage: multer.memoryStorage() });
    app.use("/up", upload.single("image"));
    app.post("/up", (req, res) => res.json({ file: req.file?.originalname }));
    const router = app._router || app.router;
    for (const layer of router.stack) {
      if (layer.route || layer.name !== "multerMiddleware") continue;
      const original = layer.handle;
      layer.handle = function patched(...args) { return original.apply(this, args); };
    }

    const { close, port } = await listen(app);
    const r = await fetch(`http://127.0.0.1:${port}/up`, { method: "POST", body: form() });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(await r.json(), { file: "poa.bin" });
    await close();
  });
});
