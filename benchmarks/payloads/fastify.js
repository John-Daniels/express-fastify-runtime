import Fastify from "fastify";

const fastify = Fastify({ logger: false, bodyLimit: 10 * 1024 * 1024 });
const PORT = Number(process.env.PORT) || 3001;

fastify.post("/", async (req, reply) => {
  return { ok: true };
});

await fastify.listen({ port: PORT, host: "0.0.0.0" });
