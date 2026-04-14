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

import { createRequire } from "node:module";
import path from "node:path";

const requireFromPkg = createRequire(__filename);
const thisDir = __dirname;

type LayerCtor = (
  path: string | RegExp | Array<string | RegExp>,
  options: { sensitive?: boolean; strict?: boolean; end?: boolean },
  fn: (req: unknown, res: unknown, next: unknown) => void,
) => void;

function patchLayerModule(layerModulePath: string): void {
  const layerModule = requireFromPkg.cache[layerModulePath];
  if (!layerModule) return;
  const OriginalLayer = layerModule.exports as LayerCtor & {
    _pathPatched?: boolean;
  };
  if (!OriginalLayer || OriginalLayer._pathPatched) return;

  const PatchedLayer = function (
    this: unknown,
    pathArg: string | RegExp | Array<string | RegExp>,
    options: { sensitive?: boolean; strict?: boolean; end?: boolean },
    fn: (req: unknown, res: unknown, next: unknown) => void,
  ) {
    if (!(this instanceof (OriginalLayer as any))) {
      return new (OriginalLayer as any)(pathArg, options, fn);
    }
    (OriginalLayer as any).call(this, pathArg, options, fn);
    const layerInstance = this as { _path?: string };
    if (typeof pathArg === "string") {
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
    const layerModulePath = requireFromPkg.resolve("router/lib/layer", {
      paths: [basePath],
    });
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
  const cwd = typeof process !== "undefined" ? process.cwd() : "";
  if (cwd && path.resolve(cwd) !== path.resolve(thisDir)) tryPatchFrom(cwd);
  // Patch from the main script's directory (CJS entry) so we patch the same router the app uses
  const main = requireFromPkg.main;
  const mainDir =
    main && typeof main.filename === "string"
      ? path.dirname(main.filename)
      : "";
  if (mainDir && path.resolve(mainDir) !== path.resolve(thisDir))
    tryPatchFrom(mainDir);
  // When entry is ESM, require.main is often undefined; use process.argv[1] so we still patch from the entry script's context
  const entryScript =
    typeof process !== "undefined" &&
    process.argv[1] &&
    path.isAbsolute(process.argv[1])
      ? process.argv[1]
      : process.argv[1]
        ? path.resolve(cwd || ".", process.argv[1])
        : "";
  const entryDir = entryScript ? path.dirname(entryScript) : "";
  if (
    entryDir &&
    path.resolve(entryDir) !== path.resolve(thisDir) &&
    path.resolve(entryDir) !== path.resolve(mainDir)
  )
    tryPatchFrom(entryDir);
} catch {
  // router not available or different structure; flattening will fall back to express lane for routers with middleware
}

export {};
