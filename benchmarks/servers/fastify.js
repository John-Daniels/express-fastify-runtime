/**
 * Benchmark server: plain Fastify.
 * Same workload as express, node-http, express-fastify-runtime.
 */

import Fastify from 'fastify';

const PORT = Number(process.env.PORT) || 3002;
const n = parseInt(process.env.MW || '5', 10);

const fastify = Fastify({ logger: false });

for (let i = 0; i < n; i++) {
  fastify.addHook('preHandler', async (req, reply) => {});
}

fastify.get('/', async (req, reply) => {
  return { ok: true };
});

await fastify.listen({ port: PORT, host: '0.0.0.0' });
console.log(`Fastify listening on ${PORT} (${n} middleware)`);
