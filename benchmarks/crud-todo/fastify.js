import Fastify from "fastify";
import { todos } from "./shared.js"; // Can reuse store

const fastify = Fastify({ logger: false });
const PORT = Number(process.env.PORT) || 3001;

// Schema validation (Fastify native way)
const schema = {
  body: {
    type: "object",
    required: ["title"],
    properties: {
      title: { type: "string", minLength: 3 },
    },
  },
};

fastify.get("/todos", async (req, reply) => {
  return todos.slice(-100);
});

fastify.post("/todos", { schema }, async (req, reply) => {
  const todo = { id: todos.length + 1, title: req.body.title };
  todos.push(todo);
  reply.code(201);
  return todo;
});

fastify.get("/todos/:id", async (req, reply) => {
  const todo = todos.find((t) => t.id === Number(req.params.id));
  if (!todo) return reply.code(404).send({ error: "Not found" });
  return todo;
});

// Error handler default is good enough or customizable
fastify.setErrorHandler((error, request, reply) => {
  reply.status(500).send({ error: error.message });
});

await fastify.listen({ port: PORT, host: "0.0.0.0" });
