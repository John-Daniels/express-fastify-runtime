/**
 * Patch the router package's Layer so that the path passed to Layer(path, options, fn)
 * is stored on the instance as _path. This allows us to flatten routers that use
 * router.use(path, fn) by reading layer._path at compile time.
 *
 * We run this when the package is loaded so that when express (and thus router) is
 * first required, the Layer in cache is already patched. We require('router/lib/layer')
 * first (which loads and caches the module), then replace its exports with our wrapper.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

try {
  const layerModulePath = require.resolve('router/lib/layer');
  const OriginalLayer = require(layerModulePath) as (
    path: string | RegExp | Array<string | RegExp>,
    options: { sensitive?: boolean; strict?: boolean; end?: boolean },
    fn: (req: unknown, res: unknown, next: unknown) => void
  ) => void;

  if (OriginalLayer && !(OriginalLayer as unknown as { _pathPatched?: boolean })._pathPatched) {
    const PatchedLayer = function (
      this: unknown,
      pathArg: string | RegExp | Array<string | RegExp>,
      options: { sensitive?: boolean; strict?: boolean; end?: boolean },
      fn: (req: unknown, res: unknown, next: unknown) => void
    ) {
      if (!(this instanceof (OriginalLayer as any))) {
        return new (OriginalLayer as any)(pathArg, options, fn);
      }
      (OriginalLayer as any).call(this, pathArg, options, fn);
      const layerInstance = this as { _path?: string };
      if (typeof pathArg === 'string') {
        layerInstance._path = pathArg;
      } else if (pathArg instanceof RegExp) {
        layerInstance._path = undefined;
      } else if (Array.isArray(pathArg)) {
        layerInstance._path = undefined;
      }
    };
    PatchedLayer.prototype = (OriginalLayer as any).prototype;
    const layerModule = require.cache[layerModulePath];
    if (layerModule) layerModule.exports = PatchedLayer;
    (PatchedLayer as unknown as { _pathPatched?: boolean })._pathPatched = true;
  }
} catch {
  // router not available or different structure; flattening will fall back to express lane for routers with middleware
}

export {};
