/**
 * Routes benchmark: fast(expressApp) — same Express app as express-routes.js.
 * Load runtime first so Router Layer is patched before Express; otherwise
 * router.use("/auth", ...) layers have no _path and routes stay on Express lane.
 */
import "../../dist/index.js";
import express from "express";
import { fast } from "../../dist/index.js";

const PORT = Number(process.env.PORT) || 3005;
const n = parseInt(process.env.MW || "5", 10);

const app = express();
for (let i = 0; i < n; i++) {
  app.use((req, res, next) => next());
}

const router = express.Router();
router.use("/auth", (req, res, next) => next());
router.get("/auth/bar", (req, res) => res.json({ from: "router" }));
app.use("/api", router);

const fastApp = fast(app);
const server = fastApp.server;
server.listen(PORT, () => {
  console.log("express-fastify-runtime (routes, fast) listening on " + PORT);
});

if (process.env.BENCH_AUTO_CLOSE !== "1") {
  process.on("SIGINT", () => server.close());
}
