/**
 * Defines an Express-like property on a shared adapter prototype that is READABLE, WRITABLE, and
 * concurrency-safe.
 *
 * The Fastify-lane req/res adapters reimplement Express's surface. Several Express properties
 * (req.ip, req.hostname, req.protocol, req.cookies, ...) are derived values, but real Express code
 * also *assigns* them (trust-proxy rewrites req.ip/protocol, cookie-parser sets req.cookies, etc.).
 * A plain read-only getter makes those assignments throw in strict mode or silently drop — which is
 * the root of the recurring "middleware breaks on the Fastify lane" bugs.
 *
 * This helper installs an accessor on the prototype whose `set` defines an OWN writable data
 * property on the instance, so:
 *   - reads compute the derived value (Express's "derived until overridden" semantics),
 *   - the first write shadows the accessor with a per-instance own property (so it sticks AND is
 *     concurrency-safe — it lives on the per-request instance, never the shared prototype).
 *
 * @param memoize  When true, the computed value is cached as a writable own property on first read
 *   (use for values that are STABLE for the life of the request and non-trivial to compute — ip,
 *   hostname, cookies — a speedup vs recomputing every access). When false, the value is recomputed
 *   on every read (use for values DERIVED FROM OTHER MUTABLE props — path←url, secure←protocol —
 *   which must stay live until explicitly overridden).
 */
export function defineWritable<T>(
  proto: object,
  key: string,
  compute: (self: Record<string, unknown>) => T,
  memoize = false,
): void {
  Object.defineProperty(proto, key, {
    configurable: true,
    enumerable: true,
    get(this: Record<string, unknown>): T {
      const value = compute(this);
      if (memoize) {
        Object.defineProperty(this, key, {
          value,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
      return value;
    },
    set(this: Record<string, unknown>, value: T): void {
      Object.defineProperty(this, key, {
        value,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    },
  });
}
