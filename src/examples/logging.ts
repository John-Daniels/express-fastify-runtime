/**
 * Example: morgan-style logging (Fastify-safe).
 * Same API as Express; runs on Fastify lane.
 */

import { createApp } from '../index';
import type { ExpressRequest, ExpressResponse, NextFunction } from '../types/express';

const app = createApp();

// Logging middleware – safe for Fastify
app.use((req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const raw = req as ExpressRequest & { method?: string; url?: string };
    console.log(`${raw.method} ${raw.url} ${res.statusCode} - ${ms}ms`);
  });
  next();
});

app.get('/', (_req: ExpressRequest, res: ExpressResponse) => {
  res.json({ ok: true });
});

app.listen(3001, () => {
  console.log('Logging example: http://localhost:3001/');
});
