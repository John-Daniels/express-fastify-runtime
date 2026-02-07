import Fastify from "fastify";
import fjwt from "@fastify/jwt";
import { SECRET, PAYLOAD } from "./shared.js";

const fastify = Fastify({ logger: false });
const PORT = Number(process.env.PORT) || 3001;

await fastify.register(fjwt, { secret: SECRET });

fastify.decorate("authenticate", async function (request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.send(err);
  }
});

fastify.get("/login", async (req, reply) => {
  const token = fastify.jwt.sign(PAYLOAD);
  return { token };
});

fastify.get(
  "/protected",
  { onRequest: [fastify.authenticate] },
  async (req, reply) => {
    return { message: "Success", user: req.user };
  },
);

await fastify.listen({ port: PORT, host: "0.0.0.0" });
