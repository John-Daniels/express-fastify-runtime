/**
 * Patch the router package's Layer so that the path passed to Layer(path, options, fn)
 * is stored on the instance as _path. This allows us to flatten routers that use
 * router.use(path, fn) by reading layer._path at compile time.
 *
 * We run once when the package is loaded (startup only; no per-request cost).
 * We patch from our package's resolution context and also from process.cwd() so
 * that when the app lives in another package (e.g. workspace or app with its own
 * node_modules), the same router copy the app uses gets patched.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const requireFromPkg = createRequire(import.meta.url);
const thisDir = path.dirname(fileURLToPath(import.meta.url));

type LayerCtor = (
  path: string | RegExp | Array<string | RegExp>,
  options: { sensitive?: boolean; strict?: boolean; end?: boolean },
  fn: (req: unknown, res: unknown, next: unknown) => void
) => void;

function patchLayerModule(layerModulePath: string): void {
  const layerModule = requireFromPkg.cache[layerModulePath];
  if (!layerModule) return;
  const OriginalLayer = layerModule.exports as LayerCtor & { _pathPatched?: boolean };
  if (!OriginalLayer || OriginalLayer._pathPatched) return;

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
  (PatchedLayer as unknown as { _pathPatched?: boolean })._pathPatched = true;
  layerModule.exports = PatchedLayer;
}

const patchedPaths = new Set<string>();

function tryPatchFrom(basePath: string): void {
  try {
    const layerModulePath = requireFromPkg.resolve('router/lib/layer', { paths: [basePath] });
    if (patchedPaths.has(layerModulePath)) return;
    patchedPaths.add(layerModulePath);
    requireFromPkg(layerModulePath);
    patchLayerModule(layerModulePath);
  } catch {
    // router not available from this path
  }
}

try {
  tryPatchFrom(thisDir);
  const cwd = typeof process !== 'undefined' ? process.cwd() : '';
  if (cwd && path.resolve(cwd) !== path.resolve(thisDir)) tryPatchFrom(cwd);
} catch {
  // router not available or different structure; flattening will fall back to express lane for routers with middleware
}

export {};
