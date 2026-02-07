import express from "express";
import { todos, validateTodo, errorHandler } from "./shared.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

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

app.listen(PORT, () => {});
