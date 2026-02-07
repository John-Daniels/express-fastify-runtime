import Fastify from "fastify";
import multipart from "@fastify/multipart";

const fastify = Fastify({ logger: false });
const PORT = Number(process.env.PORT) || 3001;

await fastify.register(multipart, { addToBody: true }); // Simplify into body like multer

fastify.post("/upload", async (req, reply) => {
  const file = req.body.file;
  // If addToBody: true, file is an array or object with buffer
  // Note: addToBody buffers whole file. Matches multer memoryStorage.
  const size = file[0] ? file[0].data.length : file.data.length;
  return { size };
});

await fastify.listen({ port: PORT, host: "0.0.0.0" });
