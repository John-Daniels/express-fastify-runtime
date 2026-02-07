/**
 * Path normalization for route matching.
 */

export function normalizePath(path: string): string {
  if (!path || path === '/') return '/';
  const trimmed = path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  return trimmed.startsWith('/') ? trimmed : '/' + trimmed;
}

export function joinPath(prefix: string, path: string): string {
  const a = normalizePath(prefix);
  const b = normalizePath(path);
  if (a === '/') return b;
  if (b === '/') return a;
  return a + b;
}
