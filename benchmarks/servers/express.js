/**
 * Benchmark server: plain Express.
 * Same workload as fastify, node-http, express-fastify-runtime.
 */

import express from 'express';

const PORT = Number(process.env.PORT) || 3001;
const n = parseInt(process.env.MW || '5', 10);

const app = express();

for (let i = 0; i < n; i++) {
  app.use((req, res, next) => next());
}

app.get('/', (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Express listening on ${PORT} (${n} middleware)`);
});
