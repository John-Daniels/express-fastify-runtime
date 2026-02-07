import Fastify from "fastify";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SimpleJSONDB } from "./SimpleJSONDB.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "db_fastify.json");
const db = new SimpleJSONDB(DB_PATH);

const fastify = Fastify({ logger: false });
const PORT = Number(process.env.PORT) || 3001;

fastify.post("/todos", async (req, reply) => {
  db.push(req.body);
  return { ok: true };
});

await fastify.listen({ port: PORT, host: "0.0.0.0" });
