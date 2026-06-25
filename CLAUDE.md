# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`express-fastify-runtime` runs existing Express apps on **Fastify** without code changes. It is a **hybrid runtime, not a wrapper**: Fastify orchestrates and executes hot paths; a real embedded `express()` instance runs anything that can't safely run on Fastify. Routing is compiled **once** at startup — there is no dynamic routing or runtime middleware resolution.

> Note: this branch (`feature/fast-patch`) is ahead of `main`. The headline addition is the `fast()` API and a large response-adapter expansion. It also switched the build from ESM to **CommonJS** (see Conventions).

## Two entry points

1. **`fast(app, ops?)`** (`runtime/fast.ts`) — the primary API. Takes an **already-built Express `Application`**, introspects its router stack (`app/introspectExpress.ts`), compiles safe routes onto Fastify, and returns the **Fastify instance**. Existing Express code stays as-is; you just wrap the app.

   ```ts
   import { fast } from "express-fastify-runtime"; // import BEFORE creating the Express app/routers
   import express from "express";
   const app = express();
   app.get("/api", (req, res) => res.json({ ok: true }));
   const fastApp = fast(app);
   await fastApp.ready();                 // if you registered Fastify plugins
   fastApp.listen({ port: 3000 });        // or fastApp.server.listen(3000, cb)
   ```

   - `fastApp.server` is the Node HTTP server — attach WebSockets / Socket.IO there. `server.listen()` is monkey-patched to delegate to Fastify's listen flow (so 404 handling and internals work); the wrapper guards against listen re-entry.
   - Express 4-arg error middleware on the app is auto-detected and wired via `fastify.setErrorHandler` so `next(err)` on the Fastify lane reaches it.
   - `ops.experimental.diagnostics: true` logs which lane handled each request.

2. **`createApp(options?)`** (`runtime/lifecycle.ts`) — builds an app with the runtime's own Express-like API (`app.use`/`app.get`/…) recorded into a `RouteStore`, then compiled at `listen()`. Returns `Promise<ServerLike>` from `listen()`.

Both paths funnel into the same compile/classify/mount machinery.

## Commands

```bash
npm run build          # tsc → dist/ (CommonJS). Tests/examples run against dist, not src.
npm test               # builds, then runs unit + integration suites
npm run test:unit
npm run test:integration

# Run a single test file (build first):
npm run build && node --test test/unit/detect.test.js

npm run benchmark             # builds, then summary report (express / fastify / node-http / runtime)
npm run benchmark:smoke       # quick fast() smoke
npm run benchmark:fast        # fast-scenarios
npm run benchmark:fast-vs-fastify
# others: :servers :routes :json :lowdb :middleware :auth :crud :payloads :uploads
node dist/examples/auth.js    # run an example (after build)
```

There is **no lint step**; type-checking happens via `tsc` during `npm run build`.

## Architecture

Request handling splits into two "lanes" decided at compile time:

```
Express app (built normally, or via createApp's API)
        ↓ introspect / record, then compile once
Route Classifier  (classify.ts → detect.ts)
   ↓ safe                    ↓ unsafe / unknown / explicitly marked
Fastify Lane                 Embedded Express Lane
(compiled routes +           (real Express app,
 preHandler)                  reached via setNotFoundHandler)
```

- **Fastify lane** (`app/compile.ts`, `fastify/adapters/`) — the `preHandler` adapts `req`/`res` **once** and runs applicable global middleware; the handler reuses those adapted objects. The req/res adapters (`fastify/adapters/request.ts`, `response.ts`) reimplement a large slice of the Express `req`/`res` surface (`res.render`, `res.sendFile`, ranges, content negotiation, cookies, etc.) — `response.ts` is the largest and most actively changing file.
- **Express lane** (`express/mount.ts`) — when no Fastify route matches, the not-found handler proxies the raw Node `req`/`res` to the real Express app, which runs its full stack.

### Lane classification (`utils/detect.ts`)

`isExpressRequired(fn)` inspects each middleware's name and **`fn.toString()`** source against `UNSAFE_NAMES` / `UNSAFE_PATTERNS` (streams, multipart, multer/busboy/formidable, `.pipe(`, `req.on('data')`). **Any doubt → Express lane**; never silently downgrade behavior. `express.json()` is special-cased to Fastify's native JSON parser (`express/middleware.ts`).

### Forcing the Express lane (`runtime/expressLane.ts`)

Wrap a handler with `expressLane(fn)` or decorate a class method with `@ExpressLane` to pin it to the Express lane (marked via the `EXPRESS_LANE` symbol). Use this for handlers needing Express-only APIs you don't want to rely on the adapters for (e.g. `res.render`, `res.sendFile`) instead of resorting to RegExp paths.

### express.Router() flattening (`app/flattenRouter.ts` + `utils/patchRouterLayer.ts`)

Routers are flattened into individual `RouteEntry`s so they can run on the Fastify lane. This relies on `patchRouterLayer.ts`, which monkey-patches the `router` package's `Layer` constructor to record each layer's string path as `_path`. **This patch is imported first thing in `src/index.ts` and must load before any router (or Express app) is created** — that's why you must import `express-fastify-runtime` before `express`. A router/app with a RegExp/array path (no string path) can't be flattened and falls back to the Express lane as a unit.

## Core invariants (do not break)

1. **Routing is immutable after startup** — `createApp`'s `assertNotLocked` makes `app.use`/`app.METHOD` throw once locked; `fast()` introspects once.
2. **Compile once** — no runtime middleware resolution, no dynamic routing.
3. **Unsure → Express lane** — never guess that something is safe.
4. **Express lane is the real Express** — never a reimplementation of routing/middleware execution (the adapters reimplement req/res *shape*, but lane fallback runs actual Express).
5. **Fail loudly** for unsupported features (`utils/assert.ts`) — don't silently no-op.

## Performance model (why the Fastify lane is fast)

When changing `app/compile.ts` or `fastify/adapters/`, preserve these (see `docs/OPTIMIZATION.md`):
- **Adapt once per request** — `preHandler` adapts `req`/`res` and stashes them on the Fastify request via `Symbol.for('express-fastify-runtime.req'/.res')`; the handler reuses them.
- **Sync-first handler loop** — `runMiddlewareChain` / `runRouteHandlers` use an index loop and only `await` when a handler returns a thenable; they stop when a handler does not call `next()` (tracked via a `nextCalled` flag).
- **One Promise at the end** — only allocate a Promise (`reply.raw.once('finish')`) when the response hasn't already been sent.

## Source layout

| Area | Files |
|------|-------|
| Entry / wrap existing app | `runtime/fast.ts`, `app/introspectExpress.ts` |
| Entry / build-with-our-API | `runtime/lifecycle.ts`, `app/RouteStore.ts`, `app/ExpressLikeApp.ts` |
| Lane classification & override | `app/classify.ts`, `utils/detect.ts`, `runtime/expressLane.ts` |
| Fastify compilation | `app/compile.ts`, `fastify/register.ts`, `fastify/adapters/{request,response,middleware}.ts` |
| Express fallback | `express/engine.ts`, `express/mount.ts`, `express/middleware.ts`, `runtime/populateExpress.ts` |
| Error bridge | `runtime/errorHandler.ts` |
| Router flattening | `app/flattenRouter.ts`, `utils/patchRouterLayer.ts` |
| Types | `types/express.ts` (public Express-like), `types/internal.ts` (`RouteEntry`, `ClassifiedRoute`, `ServerLike`, `UseHandler`) |

## Conventions

- **CommonJS build** (`tsconfig`: `module: CommonJS`, `moduleResolution: Node`, `allowJs`, decorators enabled). Imports have **no file extension** — `import { x } from './foo'`. (This is the opposite of `main`, which was ESM with `.js` extensions — don't reintroduce extensions here.)
- `experimentalDecorators` + `emitDecoratorMetadata` are on, for `@ExpressLane`.
- Runtime deps `accepts`, `type-is`, `encodeurl`, `range-parser` back the response adapter; `src/ambient.d.ts` provides ambient module declarations for the untyped CJS ones.
- `createApp().listen()` returns `Promise<ServerLike>` (`{ close(cb?), address() }`); `fast()` returns a `FastifyInstance` (sync). `http.createServer(app)` is not supported with `createApp`.
- Tests use the **Node built-in runner** (`node:test` + `node:assert`), no external framework, and run against compiled `dist/` — rebuild before testing.
- When adding/changing supported Express features, update `docs/SPEC.md`, `docs/EXPRESS_FEATURES.md`, and `ai/CONTEXT.md` (kept in sync with `ai/context.json`) — these are treated as living design docs.

## Reference docs

`docs/SPEC.md` (design/status source of truth), `docs/FAST_PRODUCTION_CHECKLIST.md` (deploying `fast()`, incl. "why is everything on the Express lane?"), `docs/HOW_EXPRESS_LANE_WORKS.md`, `docs/EXPRESS_FEATURES.md`, `docs/EXPRESS_REFERENCE.md`, `docs/OPTIMIZATION.md`, `docs/EDGE_CASES.md`, `docs/COMPARISON_FASTIFY_EXPRESS.md`, and `ai/CONTEXT.md`.
