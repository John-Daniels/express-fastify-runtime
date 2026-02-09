/**
 * req/res decoration (e.g. ensure .query, .params, .body exist).
 */

import type { ExpressRequest, ExpressResponse } from '../types/express.js';

export function decorateRequest(req: ExpressRequest): void {
  if (!req.query) (req as any).query = {};
  if (!req.params) (req as any).params = {};
}

export function decorateResponse(_res: ExpressResponse): void {
  // res.locals supported via adapter (per-request object)
}
