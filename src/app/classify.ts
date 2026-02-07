/**
 * Classify each route/middleware as safe (Fastify) or express-required.
 * No guessing: if unsure → Express lane.
 */

import type { RouteEntry, ClassifiedRoute } from '../types/internal.js';
import { isExpressRequired } from '../utils/detect.js';

export function classifyRoute(entry: RouteEntry): ClassifiedRoute[] {
  if (entry.type === 'middleware') {
    const anyUnsafe = entry.handlers.some((fn) => isExpressRequired(fn));
    return [{ ...entry, lane: anyUnsafe ? 'express' : 'fastify', expressRequired: anyUnsafe }];
  }
  const anyUnsafe = entry.handlers.some((fn) => isExpressRequired(fn));
  return [{ ...entry, lane: anyUnsafe ? 'express' : 'fastify', expressRequired: anyUnsafe }];
}

export function classifyAll(entries: readonly RouteEntry[]): ClassifiedRoute[] {
  const out: ClassifiedRoute[] = [];
  for (const entry of entries) {
    out.push(...classifyRoute(entry));
  }
  return out;
}
