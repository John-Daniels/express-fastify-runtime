/**
 * LowDB-like benchmark: fast(expressApp) — same app as express.js.
 * Load runtime first so Router is patched before Express (best practice for fast()).
 */
import "../../dist/index.js";
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expressLane, fast } from "../../dist/index.js";
import { SimpleJSONDB } from "./SimpleJSONDB.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "db_runtime_fast.json");
const db = new SimpleJSONDB(DB_PATH);

const app = express();
const PORT = Number(process.env.PORT) || 3004;

app.use(express.json());

app.post("/todos", (req, res) => {
  db.push(req.body);
  res.json({ ok: true });
});

const fastApp = fast(app);
const server = fastApp.server;
server.listen(PORT, () => {});

if (process.env.BENCH_AUTO_CLOSE !== "1") {
  process.on("SIGINT", () => server.close());
}
