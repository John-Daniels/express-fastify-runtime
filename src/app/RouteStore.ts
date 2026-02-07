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

  /** Add a single entry (used when flattening Router). */
  addEntry(entry: RouteEntry): void {
    if (entry.type === 'route') {
      this.addRoute(entry.method, entry.path, ...entry.handlers);
    } else {
      this.addMiddleware(entry.path, ...entry.handlers);
    }
  }

  /** Add multiple entries (used when flattening Router). */
  addEntries(entries: readonly RouteEntry[]): void {
    for (const entry of entries) {
      this.addEntry(entry);
    }
  }

  getAll(): readonly RouteEntry[] {
    return this.entries;
  }

  clear(): void {
    this.entries = [];
  }
}
