/**
 * Smoke test: run server, hit GET / and /v1/tasks, assert 200 (not 404).
 * Run from repo root after npm run build: node examples/task-manager-api/test.js
 */
const path = require("path");
const repoRoot = path.resolve(__dirname, "../..");
const distIndex = path.join(repoRoot, "dist", "index.js");
require(distIndex); // load runtime first (patch)
const express = require("express");
const { fast } = require(distIndex);

async function main() {
  // Build app the same way as index.js: runtime first (we require dist first above), then express
  const app = express();
  app.use(express.json());
  app.get("/", (req, res) => res.json({ message: "Task Manager API" }));
  app.get("/health", (req, res) => res.json({ status: "ok" }));
  const v1 = express.Router();
  v1.get("/tasks", (req, res) => res.json({ tasks: [] }));
  app.use("/v1", v1);
  app.use((req, res) => res.status(404).json({ error: "Not Found" }));

  const fastApp = fast(app);
  await new Promise((resolve, reject) => {
    fastApp.server.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
  });
  const port = fastApp.server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const failures = [];
  const assert = (name, ok, detail) => {
    if (!ok) failures.push({ name, detail });
  };

  let res = await fetch(`${base}/`);
  assert("GET / status 200", res.status === 200, `got ${res.status}`);
  if (res.status === 200) {
    const body = await res.json();
    assert("GET / body", body && body.message === "Task Manager API", JSON.stringify(body));
  }

  res = await fetch(`${base}/health`);
  assert("GET /health status 200", res.status === 200, `got ${res.status}`);

  res = await fetch(`${base}/v1/tasks`);
  assert("GET /v1/tasks status 200", res.status === 200, `got ${res.status}`);

  await fastApp.close();

  if (failures.length) {
    console.error("Failures:", failures);
    process.exit(1);
  }
  console.log("All checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
