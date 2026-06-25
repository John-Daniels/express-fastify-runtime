import "../../dist/index.js";
import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fast } from "../../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "data.json"), "utf-8"));

const app = express();
const PORT = Number(process.env.PORT) || 3004;

app.get("/todos", (req, res) => {
  res.json(data);
});

const fastApp = fast(app);
fastApp.server.listen(PORT, () => {});

if (process.env.BENCH_AUTO_CLOSE !== "1") {
  process.on("SIGINT", () => fastApp.server.close());
}
