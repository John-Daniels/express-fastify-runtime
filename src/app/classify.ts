/**
 * Classify each route/middleware as safe (Fastify) or express-required.
 * No guessing: if unsure → Express lane.
 */

import type { RouteEntry, ClassifiedRoute } from '../types/internal';
import { isExpressRequired } from '../utils/detect';

export function classifyRoute(entry: RouteEntry): ClassifiedRoute[] {
  // expressRequiredHint is set at flatten time from the Express layer name — the only reliable
  // signal when an APM (Sentry/OTel) has wrapped the handler and hidden multer/busboy from
  // handler inspection. See app/flattenRouter.ts and utils/detect.isExpressRequiredName.
  const anyUnsafe =
    entry.expressRequiredHint === true || entry.handlers.some((fn) => isExpressRequired(fn));
  return [{ ...entry, lane: anyUnsafe ? 'express' : 'fastify', expressRequired: anyUnsafe }];
}

export function classifyAll(entries: readonly RouteEntry[]): ClassifiedRoute[] {
  const out: ClassifiedRoute[] = [];
  for (const entry of entries) {
    out.push(...classifyRoute(entry));
  }
  return out;
}
