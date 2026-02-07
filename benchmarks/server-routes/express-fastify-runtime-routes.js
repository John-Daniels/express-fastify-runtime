/**
 * Benchmark server: express-fastify-runtime with Router (router.use + router.get).
 * Same shape as express-routes.js; flattened to Fastify lane.
 */

import { createApp } from "../../dist/index.js";

const PORT = Number(process.env.PORT) || 3004;
const n = parseInt(process.env.MW || "5", 10);

const app = createApp();

for (let i = 0; i < n; i++) {
  app.use((req, res, next) => next());
}

const { Router } = await import("express");
const router = Router();
router.use("/auth", (req, res, next) => next());
router.get("/auth/bar", (req, res) => res.json({ from: "router" }));
app.use("/api", router);

const server = await app.listen(PORT);
console.log(`express-fastify-runtime (routes) listening on ${PORT} (${n} middleware + Router)`);

if (process.env.BENCH_AUTO_CLOSE !== "1") {
  process.on("SIGINT", () => server.close());
}
