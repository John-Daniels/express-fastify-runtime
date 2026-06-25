/**
 * Task Manager API — real-world style app for testing express-fastify-runtime.
 *
 * CRITICAL: Load express-fastify-runtime BEFORE express so router Layer is patched
 * and routes compile to the Fastify lane (see docs/FAST_PRODUCTION_CHECKLIST.md).
 *
 * Run from repo root after npm run build:
 *   node examples/task-manager-api/index.js
 */
const path = require("path");
const runtimePath = path.resolve(__dirname, "../../dist/index.js");
require(runtimePath);
const express = require("express");
const { fast } = require(runtimePath);

const app = express();

app.use(require("express").json());
app.use(require("express").urlencoded({ extended: false }));

// Root and health (should be Fastify lane when patch is applied)
app.get("/", (req, res) => {
  res.json({ message: "Task Manager API", version: "1.0" });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// /v1 deep routes (like user's /v1/admins/auth/login)
const v1 = express.Router();
const tasks = express.Router();
const tasksList = [];
tasks.get("/", (req, res) => {
  res.json({ tasks: tasksList });
});
tasks.post("/", (req, res) => {
  const task = { id: String(tasksList.length + 1), title: req.body?.title || "Untitled", done: false };
  tasksList.push(task);
  res.status(201).json(task);
});
tasks.get("/:id", (req, res) => {
  const task = tasksList.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json(task);
});
v1.use("/tasks", tasks);
app.use("/v1", v1);

// 404 handler (must run after all routes)
function respond(res, status, message, data = {}) {
  const successCodes = [200, 201];
  return res.status(status).send({
    status: successCodes.includes(status) ? "success" : "error",
    message,
    data,
  });
}
app.use((req, res) => {
  respond(res, 404, "Not Found");
});

const fastApp = fast(app, { experimental: { diagnostics: true } });
const server = fastApp.server;
const PORT = Number(process.env.PORT) || 5002;

server.listen({ port: PORT, host: "0.0.0.0" }, () => {
  console.log(`Task Manager API: http://localhost:${PORT}`);
  console.log("  GET /         → root");
  console.log("  GET /health   → health");
  console.log("  GET /v1/tasks → list tasks");
  console.log("  POST /v1/tasks → create task");
});

module.exports = { app, fastApp, server };
