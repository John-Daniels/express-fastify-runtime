/**
 * CRUD Todo benchmark: fast(expressApp) — same app as express.js.
 * Load runtime first so Router is patched before Express (best practice for fast()).
 */
import "../../dist/index.js";
import express from "express";
import { fast } from "../../dist/index.js";
import { todos, validateTodo, errorHandler } from "./shared.js";

const app = express();
const PORT = Number(process.env.PORT) || 3004;

app.use(express.json());

app.get("/todos", (req, res) => {
  res.json(todos.slice(-100));
});

app.post("/todos", validateTodo, (req, res) => {
  const todo = { id: todos.length + 1, title: req.body.title };
  todos.push(todo);
  res.status(201).json(todo);
});

app.get("/todos/:id", (req, res) => {
  const todo = todos.find((t) => t.id === Number(req.params.id));
  if (!todo) return res.status(404).json({ error: "Not found" });
  res.json(todo);
});

app.use(errorHandler);

const fastApp = fast(app);
const server = fastApp.server;
server.listen(PORT, () => {});

if (process.env.BENCH_AUTO_CLOSE !== "1") {
  process.on("SIGINT", () => server.close());
}
