/**
 * Example: auth middleware (Fastify-safe).
 * Same API as Express; runs on Fastify lane.
 */

import { createApp } from '../index';
import type { ExpressRequest, ExpressResponse, NextFunction } from '../types/express';

const app = createApp();

// Auth middleware – safe for Fastify
app.use((req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
  const token = req.get('authorization');
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  (req as ExpressRequest & { user?: unknown }).user = { id: '1', name: 'User' };
  next();
});

app.get('/me', (req: ExpressRequest, res: ExpressResponse) => {
  const user = (req as ExpressRequest & { user?: unknown }).user;
  res.json({ user });
});

app.listen(3000, () => {
  console.log('Auth example: http://localhost:3000/me');
});
