/**
 * Map Express routing settings to Fastify (find-my-way) options so matching behaves like Express.
 *
 * Express defaults: "case sensitive routing" OFF (so `/Foo` matches `/foo`) and "strict routing" OFF
 * (so `/x` and `/x/` both match). Fastify's defaults are the opposite (case-sensitive, trailing slash
 * significant), so without this fast() would be STRICTER than the Express app it wraps. We read the
 * app's settings and translate:
 *   - caseSensitive       = ("case sensitive routing" enabled)
 *   - ignoreTrailingSlash = ("strict routing" NOT enabled)
 */

interface ExpressSettingsApp {
  enabled?: (name: string) => boolean;
}

export interface RoutingOptions {
  caseSensitive: boolean;
  ignoreTrailingSlash: boolean;
}

export function deriveRoutingOptions(app: unknown): RoutingOptions {
  const a = app as ExpressSettingsApp;
  const enabled = typeof a?.enabled === 'function' ? (name: string) => a.enabled!(name) : () => false;
  let caseSensitiveRouting = false;
  let strictRouting = false;
  try {
    caseSensitiveRouting = enabled('case sensitive routing') === true;
    strictRouting = enabled('strict routing') === true;
  } catch {
    // Non-Express-shaped app (e.g. createApp's own engine) — keep Express-like defaults.
  }
  return {
    caseSensitive: caseSensitiveRouting,
    ignoreTrailingSlash: !strictRouting,
  };
}
