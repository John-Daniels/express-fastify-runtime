/**
 * Example: file uploads (Express-required).
 * Uses Express lane for multer / multipart; same API as Express.
 */

import { createApp } from '../index.js';
import type { ExpressRequest, ExpressResponse, NextFunction } from '../types/express.js';

const app = createApp();

// Multer-like middleware would be express-required and run on Express lane.
// For demo we use a simple JSON body route (Fastify) and a placeholder "upload" (Express).
app.use((_req: ExpressRequest, _res: ExpressResponse, next: NextFunction) => {
  next();
});

app.post('/api/upload', (_req: ExpressRequest, res: ExpressResponse) => {
  // In real app: multer runs on Express lane; handler runs after.
  res.json({ message: 'Upload would run on Express lane with multer' });
});

app.listen(3002, () => {
  console.log('Uploads example: http://localhost:3002/api/upload');
});
