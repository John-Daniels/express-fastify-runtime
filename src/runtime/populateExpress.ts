/**
 * Populate real Express app from RouteStore (all middleware + routes).
 */

import type { Application } from 'express';
import type { RouteStore } from '../app/RouteStore.js';
import { normalizePath } from '../utils/path.js';

export function populateExpressApp(expressApp: Application, store: RouteStore): void {
  const entries = store.getAll();
  for (const entry of entries) {
    if (entry.type === 'middleware') {
      const path = normalizePath(entry.path);
      expressApp.use(path, ...(entry.handlers as any));
    } else {
      const path = normalizePath(entry.path);
      const method = entry.method === 'all' ? 'all' : (entry.method as 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options');
      if (method === 'all') {
        (expressApp as any).all(path, ...entry.handlers);
      } else {
        (expressApp as any)[method](path, ...entry.handlers);
      }
    }
  }
}
