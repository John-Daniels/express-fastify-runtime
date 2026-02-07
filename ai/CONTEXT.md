# express-fastify-runtime — AI context / memories

Use this file as full context when working with AI on this project (any session, any tool). It consolidates architecture, rules, implementation state, and how to continue.

---

## 1. Project

- **Name:** `express-fastify-runtime`
- **Goal:** Run existing Express apps on **Fastify** safely, faster, and without code changes. Production middleware (morgan, helmet, express.json, auth, multer) must work.
- **What it is:** A **hybrid runtime**, not a wrapper. Fastify orchestrates; Express runs when required. Compile once at `listen()`; no dynamic routing.

---

## 2. Architecture (locked)

```
Express-Compatible API (app.use, app.get, req, res, next)
         ↓ compile-time
Route Classifier (safe vs unsafe middleware)
    ↓                    ↓
Fastify Lane         Embedded Express Lane
(compiled routes     (real express() instance,
 + preHandler)        proxy from Fastify)
```

- **Fastify lane:** Request hits Fastify → adapt req/res once → run compiled middleware (preHandler) → run route handler → send.
- **Express lane:** No Fastify route matched → setNotFoundHandler proxies raw req/res to real Express app → Express runs full stack → response back to Fastify.

---

## 3. Guarantees (non-negotiable)

- Express apps run **unchanged** (same API, same middleware order and `next()`).
- **Middleware safety:** morgan, helmet, express.json(), auth, multer must behave as in Express.
- **Performance:** Hot paths on Fastify; unsafe paths on real Express. No silent behavior changes; fail fast in dev.

---

## 4. Core design rules (do not break)

1. **Routes immutable after `listen()`** — `app.use()` / `app.get()` after `listen()` must throw.
2. **Compile once** — No runtime middleware resolution; no dynamic routing.
3. **No guessing safety** — If unsure → **Express lane**. Never silently downgrade.
4. **Express lane = real Express** — Use actual `express()` instance (engine.ts), not a reimplementation.

---

## 5. Project structure (exact — do not change layout)

```
src/
├── index.ts                     # createApp() export
├── app/
│   ├── ExpressLikeApp.ts        # stub; real impl in lifecycle
│   ├── RouteStore.ts            # stores routes + middleware
│   ├── classify.ts              # safe vs express-required
│   ├── compile.ts               # compile to Fastify (preHandler + routes)
│   └── flattenRouter.ts          # isExpressRouter, flattenRouter (Router → RouteEntry[])
├── fastify/
│   ├── register.ts              # registerCompiledRoutes
│   └── adapters/
│       ├── request.ts           # adaptRequest, createRequestAdapter
│       ├── response.ts          # adaptResponse, createResponseAdapter
│       └── middleware.ts        # toPreHandler
├── express/
│   ├── engine.ts                # createExpressEngine() — real express()
│   ├── mount.ts                 # mountExpress — setNotFoundHandler → proxy to Express
│   └── middleware.ts            # isExpressJson, expressJsonPassthrough
├── runtime/
│   ├── lifecycle.ts             # createApp(), boot, lock, listen
│   ├── populateExpress.ts      # add all routes to Express app
│   ├── decorators.ts            # req/res decoration
│   └── errorHandler.ts          # wrapErrorHandler
├── utils/
│   ├── detect.ts                # isExpressRequired, isFastifySafe
│   ├── assert.ts                # assertNotLocked, failUnsupportedFeature
│   ├── patchRouterLayer.ts      # patch Layer to store _path for router.use() flattening
│   └── path.ts                  # normalizePath, joinPath
├── types/
│   ├── express.ts               # ExpressRequest, ExpressResponse, NextFunction, etc.
│   └── internal.ts              # RouteEntry, ClassifiedRoute, ExpressLikeApp, ServerLike
└── examples/
    ├── auth.ts
    ├── uploads.ts
    └── logging.ts

test/          # unit + integration (node --test)
benchmarks/    # express, fastify, node-http, express-fastify-runtime
docs/          # SPEC.md, OPTIMIZATION.md, EXPRESS_FEATURES.md
ai/            # this folder — CONTEXT.md
```

---

## 6. Middleware classification

- **Fastify-safe:** `(req, res, next)`, no streams, no prototype mutation, no req.app/res.locals. Examples: morgan, helmet, auth, validation.
- **Express-required:** streams (req.pipe), multipart, Express internals. Examples: multer, storage.upload().
- **Detection:** `utils/detect.ts` — isExpressRequired(), isFastifySafe(). If unsure → Express lane.
- **express.json():** Intercepted and mapped to Fastify JSON parser. Multipart → Express lane only.

---

## 7. Listen & server

- **Overloads (Express-style):** `app.listen(callback?)`, `app.listen(port, callback?)`, `app.listen(port, host, callback?)`.
- **Return:** `Promise<ServerLike>` (Express returns `http.Server` synchronously; we are async). Do **not** return `unknown`.
- **ServerLike:** `{ close(callback?), address() }`. Same idea as Node's server for shutdown and inspection. We do **not** call `process.exit`; the app calls `server.close()` when it wants to stop.
- **http.createServer(app):** Not supported; use `app.listen()`.

---

## 8. Optimization principles (why it's fast)

1. **Zero alloc hot path** — Reusable req/res (createRequestAdapter, createResponseAdapter); mutate per request, no new objects/closures.
2. **Adapt once per request** — preHandler adapts and attaches req/res to request (kExpressReq, kExpressRes); handler reuses them.
3. **Sync-first handler loop** — while loop, index-based next; await only when handler returns thenable.
4. **One Promise when waiting** — Only one `new Promise` + `reply.raw.once('finish')` when response not yet sent.
5. **Same API, minimal shape** — Small req/res surface; no full Express prototype chain.

---

## 9. Supported vs not (v1)

**Supported:** app.use, app.METHOD, app.all, app.listen (overloads above); req.get/header, query, params, body, method, url, headers; res.status, send, json, set; next(); async handlers; express.json() → Fastify; route locking; ServerLike with close/address.

**express.Router():** Supported. `app.use(path?, router)` flattens the router so routes and middleware can run on the Fastify lane. We patch the router package's Layer (see utils/patchRouterLayer.ts) to store the path on each layer as `_path`; then flattenRouter can flatten router.use(path, fn) and nested routers. Load express-fastify-runtime before creating routers so the patch is applied. If any middleware layer has no path (e.g. RegExp path), that router is mounted as a single unit on the Express lane. **Not supported / fail loudly:** res.locals, runtime mutation of middleware stack. Other Express features (app.set, app.render, req.accepts, res.redirect, etc.) are "not yet" — see docs/EXPRESS_FEATURES.md.

---

## 10. Commands

- **Build:** `npm run build`
- **Test:** `npm test` (build + node --test on test/unit/*.test.js test/integration/*.test.js)
- **Benchmark:** `npm run benchmark` (express, fastify, node-http, express-fastify-runtime)

---

## 11. Key implementation details

- **Route store:** RouteStore holds middleware and route entries until listen(). Then classify → compile → register Fastify routes + mount Express.
- **Compile:** Only fastify-safe routes are registered on Fastify. preHandler runs applicable global middleware and attaches req/res; handler runs route handlers using attached req/res. Unsafe routes/middleware run only on Express (notFoundHandler proxies to Express).
- **Express app:** populateExpressApp() adds *all* entries to the real Express app so the Express lane has the full stack.
- **Types:** Express-like types in types/express.ts; internal (RouteEntry, ClassifiedRoute, ServerLike, etc.) in types/internal.ts. Align with Express interfaces where we support features; see @types/express-serve-static-core for reference.

---

## 12. How to continue work

1. Read this file and docs/SPEC.md (and optionally docs/OPTIMIZATION.md, docs/EXPRESS_FEATURES.md).
2. Run `npm run build`, `npm test`, `npm run benchmark`.
3. Pick an item from acceptance criteria or "not yet" features.
4. Change only the listed modules; keep the structure above.
5. Update SPEC.md implementation status and EXPRESS_FEATURES.md if you add support for a feature.

---

## 13. Acceptance criteria (definition of done)

- [ ] Existing Express app runs without modification.
- [ ] Auth middleware does not fail.
- [ ] Morgan logs correctly.
- [ ] Helmet headers correct.
- [ ] File uploads work via multer (Express lane).
- [ ] Hot routes outperform plain Express.
- [ ] Unsafe routes work correctly on Express lane.
- [ ] No silent behavior changes; refactor, don't patch.

---

## 14. File reference

| Need to…              | File(s) |
|-----------------------|--------|
| Change app API/listen | src/runtime/lifecycle.ts, src/types/internal.ts |
| Change req/res shape  | src/types/express.ts, src/fastify/adapters/request.ts, response.ts |
| Change classification | src/app/classify.ts, src/utils/detect.ts |
| Change compilation    | src/app/compile.ts, src/fastify/register.ts |
| Change Express mount  | src/express/mount.ts, src/runtime/populateExpress.ts |
| Add Express feature   | docs/EXPRESS_FEATURES.md + relevant src (app, adapters, etc.) |
| Update spec/status    | docs/SPEC.md, this file |

This file is the single "memories" dump for the project. Keep it updated when making significant changes. A JSON version of this context lives in **ai/context.json** for tools and scripts; keep both in sync.
