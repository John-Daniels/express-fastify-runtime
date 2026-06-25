/**
 * Unwrap instrumentation wrappers to reach the original handler.
 *
 * APMs (OpenTelemetry / Sentry, via `shimmer`) wrap Express handlers, setting `wrapped.__original`
 * to the real function (and `wrapped.__wrapped = true`); the wrapper's own `.name` becomes
 * something like "patched". Our middleware identity checks (express.json, urlencoded, multer, …)
 * inspect the function name/source, so they must look through the wrapper — otherwise a wrapped
 * `jsonParser` isn't recognized, runs on the Fastify lane, and tries to read the already-consumed
 * request stream ("argument stream must be a stream"). Follows the `__original` chain defensively.
 */
export function unwrapHandler<T>(fn: T): T {
  let cur: unknown = fn;
  let depth = 0;
  while (
    typeof cur === "function" &&
    typeof (cur as { __original?: unknown }).__original === "function" &&
    depth++ < 16
  ) {
    cur = (cur as { __original?: unknown }).__original;
  }
  return cur as T;
}
