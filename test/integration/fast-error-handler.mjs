import { fast } from '../../dist/index.js';
import express from 'express';

// Use middleware-only app so /fail is handled by notFoundHandler → Express (adapted res works there)
const app = express();
app.use((req, res, next) => {
  if (req.method === 'GET' && (req.url === '/fail' || req.url?.startsWith('/fail'))) return next(new Error('expected error'));
  next();
});
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message });
});

const fastify = fast(app);
await fastify.listen({ port: 0, host: '127.0.0.1' });
const port = fastify.server.address().port;

const res = await fetch(`http://127.0.0.1:${port}/fail`);
const body = await res.json();
console.log('status', res.status, 'body', body);

await fastify.close();
process.exit(res.status === 500 && body.error === 'expected error' ? 0 : 1);
