/**
 * Stores routes and middleware before compile. Immutable after listen().
 */

import type { RouteEntry } from '../types/internal.js';
import type { ExpressHandler } from '../types/express.js';
import { HTTP_METHODS, type HttpMethod } from '../types/express.js';

export class RouteStore {
  private entries: RouteEntry[] = [];

  addMiddleware(path: string, ...handlers: ExpressHandler[]): void {
    this.entries.push({ type: 'middleware', path, handlers });
  }

  addRoute(method: string, path: string, ...handlers: ExpressHandler[]): void {
    const m = method.toLowerCase();
    if (!HTTP_METHODS.includes(m as HttpMethod) && m !== 'all') {
      throw new TypeError(`Invalid method: ${method}`);
    }
    this.entries.push({ type: 'route', method: m, path, handlers });
  }

  getAll(): readonly RouteEntry[] {
    return this.entries;
  }

  clear(): void {
    this.entries = [];
  }
}
