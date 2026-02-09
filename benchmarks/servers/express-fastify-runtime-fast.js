/**
 * Benchmark server: express-fastify-runtime via fast(expressApp).
 * Same workload as express-fastify-runtime (createApp) for comparison.
 */

import express from "express";
import { fast } from "../../dist/index.js";

const PORT = Number(process.env.PORT) || 3005;
const n = parseInt(process.env.MW || "5", 10);

const app = express();

for (let i = 0; i < n; i++) {
  app.use((req, res, next) => next());
}

app.get("/", (req, res) => {
  res.json({ ok: true });
});

const fastApp = fast(app);
const server = fastApp.server;
server.listen(PORT, () => {
  console.log(`express-fastify-runtime (fast) listening on ${PORT} (${n} middleware)`);
});

if (process.env.BENCH_AUTO_CLOSE !== "1") {
  process.on("SIGINT", () => server.close());
}
