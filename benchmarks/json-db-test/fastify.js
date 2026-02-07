import Fastify from "fastify";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "data.json");

const fastify = Fastify({ logger: false });
const PORT = Number(process.env.PORT) || 3001;

const data = JSON.parse(readFileSync(DB_PATH, "utf-8"));

fastify.get("/todos", async (req, reply) => {
  return data;
});

await fastify.listen({ port: PORT, host: "0.0.0.0" });
// console.log(`Fastify listening on ${PORT}`);
