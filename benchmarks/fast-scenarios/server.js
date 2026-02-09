/**
 * Benchmark server for fast() scenarios.
 * Env: SCENARIO=baseline|many-routes|deep-middleware|json-body|headers|redirect|send-string|express-lane
 *       TARGET=express|fast
 *       PORT=...
 * Starts either raw Express or fast(expressApp) so we can compare where fast() wins or fails.
 */

import express from "express";
import { fast } from "../../dist/index.js";

const PORT = Number(process.env.PORT) || 4001;
const SCENARIO = process.env.SCENARIO || "baseline";
const TARGET = process.env.TARGET || "express";

function createApp() {
  const app = express();

  switch (SCENARIO) {
    case "baseline": {
      for (let i = 0; i < 5; i++) {
        app.use((req, res, next) => next());
      }
      app.get("/", (req, res) => res.json({ ok: true }));
      break;
    }
    case "many-routes": {
      for (let i = 0; i < 5; i++) {
        app.use((req, res, next) => next());
      }
      for (let i = 1; i <= 30; i++) {
        app.get(`/r/${i}`, (req, res) => res.json({ id: i }));
      }
      app.get("/", (req, res) => res.json({ ok: true }));
      break;
    }
    case "deep-middleware": {
      for (let i = 0; i < 25; i++) {
        app.use((req, res, next) => next());
      }
      app.get("/", (req, res) => res.json({ ok: true }));
      break;
    }
    case "json-body": {
      app.use(express.json());
      for (let i = 0; i < 5; i++) {
        app.use((req, res, next) => next());
      }
      app.post("/", (req, res) => res.json({ ok: true, body: req.body }));
      break;
    }
    case "headers": {
      for (let i = 0; i < 5; i++) {
        app.use((req, res, next) => next());
      }
      app.get("/", (req, res) => {
        const x = req.get("x-foo");
        const cookie = req.get("Cookie");
        res.json({ ok: true, x, hasCookie: !!cookie });
      });
      break;
    }
    case "redirect": {
      for (let i = 0; i < 5; i++) {
        app.use((req, res, next) => next());
      }
      app.get("/", (req, res) => res.json({ ok: true }));
      app.get("/r", (req, res) => res.redirect(302, "/"));
      break;
    }
    case "send-string": {
      for (let i = 0; i < 5; i++) {
        app.use((req, res, next) => next());
      }
      app.get("/", (req, res) => res.send("hello"));
      break;
    }
    case "express-lane": {
      // RegExp route: Fastify lane doesn't flatten it, so every request hits Express
      for (let i = 0; i < 5; i++) {
        app.use((req, res, next) => next());
      }
      app.get(/^\/x/, (req, res) => res.json({ ok: true, lane: "express" }));
      break;
    }
    default: {
      for (let i = 0; i < 5; i++) {
        app.use((req, res, next) => next());
      }
      app.get("/", (req, res) => res.json({ ok: true }));
    }
  }

  return app;
}

const app = createApp();

if (TARGET === "fast") {
  const fastApp = fast(app);
  const server = fastApp.server;
  server.listen(PORT, () => {
    console.log(`fast() [${SCENARIO}] listening on ${PORT}`);
  });
  if (process.env.BENCH_AUTO_CLOSE !== "1") {
    process.on("SIGINT", () => server.close());
  }
} else {
  app.listen(PORT, () => {
    console.log(`Express [${SCENARIO}] listening on ${PORT}`);
  });
  if (process.env.BENCH_AUTO_CLOSE !== "1") {
    process.on("SIGINT", () => process.exit(0));
  }
}
