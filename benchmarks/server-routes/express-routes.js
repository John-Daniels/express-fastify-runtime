/**
 * Benchmark server: plain Express with Router (router.use + router.get).
 * Same shape as express-fastify-runtime-routes.js for fair comparison.
 */

import express from "express";

const PORT = Number(process.env.PORT) || 3001;
const n = parseInt(process.env.MW || "5", 10);

const app = express();

for (let i = 0; i < n; i++) {
  app.use((req, res, next) => next());
}

const router = express.Router();
router.use("/auth", (req, res, next) => next());
router.get("/auth/bar", (req, res) => res.json({ from: "router" }));
app.use("/api", router);

app.listen(PORT, () => {
  console.log(`Express (routes) listening on ${PORT} (${n} middleware + Router)`);
});
