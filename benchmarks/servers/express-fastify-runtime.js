/**
 * Benchmark server: express-fastify-runtime (same Express-style API).
 * Same workload as express, fastify, node-http.
 */

import { createApp } from '../../dist/index.js';

const PORT = Number(process.env.PORT) || 3004;
const n = parseInt(process.env.MW || '5', 10);

const app = createApp();

for (let i = 0; i < n; i++) {
  app.use((req, res, next) => next());
}

app.get('/', (req, res) => {
  res.json({ ok: true });
});

const server = await app.listen(PORT);
console.log(`express-fastify-runtime listening on ${PORT} (${n} middleware)`);

// Keep process alive; for benchmark script we'll kill by pid
if (process.env.BENCH_AUTO_CLOSE !== '1') {
  process.on('SIGINT', () => server.close().then(() => process.exit(0)));
}
