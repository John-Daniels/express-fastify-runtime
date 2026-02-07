# express-fastify-runtime — Specification

This document is the single source of truth for architecture, guarantees, and implementation so work can be continued later without re-deriving design decisions.

---

## 1. Name & Goal

- **Name:** `express-fastify-runtime`
- **Goal:** Run existing Express apps on Fastify **safely, faster, and without code changes**, with production middleware compatibility.

---

## 2. Guarantees (Non-Negotiable)

### Express compatibility

- Existing Express apps run **unchanged**.
- Same API: `app.use`, `app.get` (and other METHODS), `req`, `res`, `next`.
- Same middleware semantics (order, `next()`, sync/async).

### Middleware safety (critical)

The following MUST behave as in Express:

- `morgan()`
- `helmet()`
- `express.json()`
- Authentication middleware
- `multer`, `storage.upload()`, file uploads

### Performance

- Hot paths (auth, JSON APIs) run on **Fastify**.
- Unsafe paths use **real Express**.
- No silent behavior changes; fail fast in dev.

---

## 3. Architecture (Locked)

This is a **hybrid runtime**, not a thin wrapper.

```
┌─────────────────────────────┐
│ Express-Compatible API      │
│ (what users write)          │
└────────────┬────────────────┘
             │ compile-time
┌────────────▼────────────────┐
│ Route Classifier             │
│ (safe vs unsafe middleware)  │
└───────┬───────────────┬──────┘
        │               │
┌───────▼───────┐ ┌─────▼─────────────────┐
│ Fastify Lane  │ │ Embedded Express Lane  │
│ (compiled)    │ │ (real Express engine)  │
└───────────────┘ └────────────────────────┘
```

**Fastify orchestrates. Express runs when required.**

---

## 4. Project Structure (Exact)

Do not change this layout.

```
src/
├── index.ts                     # createApp() export
├── app/
│   ├── ExpressLikeApp.ts        # app.use, app.get, app.listen (stub; real impl in lifecycle)
│   ├── RouteStore.ts            # stores routes + middleware
│   ├── classify.ts              # safe vs express-required
│   └── compile.ts               # compile to Fastify
├── fastify/
│   ├── register.ts              # registers fastify instance
│   └── adapters/
│       ├── request.ts           # FastifyRequest → Express req
│       ├── response.ts          # FastifyReply → Express res
│       └── middleware.ts        # (req,res,next) → async hook
├── express/
│   ├── engine.ts                # real Express app instance
│   ├── mount.ts                 # proxy Fastify → Express
│   └── middleware.ts            # passthrough helpers (e.g. express.json)
├── runtime/
│   ├── lifecycle.ts             # boot, lock, listen
│   ├── populateExpress.ts       # add all routes to Express app
│   ├── decorators.ts            # req/res decoration
│   └── errorHandler.ts          # express-style error bridge
├── utils/
│   ├── detect.ts                # unsafe middleware detection
│   ├── assert.ts                # fail-fast helpers
│   └── path.ts                  # path normalization
├── types/
│   ├── express.ts               # Express-like types
│   └── internal.ts              # internal compiler types
└── examples/
    ├── auth.ts
    ├── uploads.ts
    └── logging.ts

test/                            # tests (see Test plan below)
benchmarks/                      # express, fastify, node:http, express-fastify-runtime
docs/
└── SPEC.md                      # this file
```

---

## 5. Core Design Rules (Do Not Break)

| Rule | Description |
|------|-------------|
| **1. Routes immutable after `listen()`** | `app.use()` / `app.get()` after `listen()` must throw. |
| **2. Compile once** | No runtime middleware resolution; no dynamic routing. |
| **3. No guessing safety** | If unsure → **Express lane**. Never silently downgrade. |
| **4. Express lane = real Express** | Use an actual `express()` instance, not a reimplementation. |

---

## 6. Middleware Classification

### Fastify-safe

Runs in Fastify lane when it:

- Has signature `(req, res, next)`.
- Does not use streams (e.g. `req.pipe`).
- Does not mutate prototypes.
- Does not rely on `req.app` or `res.locals`.

Examples: `morgan`, `helmet`, typical auth, validation, rate limiting.

### Express-required

Runs in Express lane when it:

- Uses streams (`req.pipe`, `req.on('data')`, etc.).
- Handles multipart uploads.
- Uses Express internals.

Examples: `multer`, `storage.upload()`, legacy body parsers.

Detection lives in `src/utils/detect.ts` (names + pattern heuristics). When in doubt, treat as express-required.

---

## 7. Body Parsing

- `express.json()`: **intercepted** and mapped to Fastify’s JSON parser (same behavior, faster).
- Multipart: **Express lane only**.

---

## 8. Request Flow

### Fastify lane

1. Fastify receives request.
2. Decorate req/res once (adapters).
3. Run compiled middleware (preHandler).
4. Run route handler.
5. Send response.

### Express lane

1. Fastify receives request.
2. No Fastify route matches → not-found handler runs.
3. Request is proxied to Express app (raw Node req/res).
4. Express runs its middleware + route.
5. Response is sent back through Fastify.

---

## 9. Supported API (v1)

| Supported | Not supported (v1) |
|-----------|-------------------|
| `app.use(fn)`, `app.METHOD(path, ...handlers)` | `express.Router()` |
| `req.body`, `req.query`, `req.params` | `res.locals` |
| `res.status().send().json().set()` | Runtime mutation of middleware stack |
| `next()`, async handlers | |
| Global error middleware | |

Unsupported features must **fail loudly** (throw or explicit error), not silently.

---

## 10. Test Plan

- **Location:** `test/`
- **Runner:** Node.js built-in test runner (`node --test`).
- **Scope:**
  - Unit: `RouteStore`, `classify`, `detect`, `path`, `assert`.
  - Integration: `createApp()` — use, METHOD, listen, route locking.
  - Compatibility: morgan logs, helmet headers, `express.json()` body, auth sets `req.user`, multer upload (when added).

- Run: `npm test` (or `node --test test/unit/path.test.js test/unit/detect.test.js test/unit/assert.test.js test/integration/app.test.js`).
- See `test/README.md` for layout and adding tests.

---

## 11. Benchmarks

- **Location:** `benchmarks/`
- **Targets:** Compare under the same workload:
  - **express** — plain Express app
  - **fastify** — plain Fastify app
  - **node:http** — raw Node HTTP server
  - **express-fastify-runtime** — same Express-style app on this runtime

Same scenario for all: e.g. N middleware + one JSON route; measure requests/sec and latency.

- Run: `npm run benchmark` (requires `autocannon` as devDependency). Servers: `benchmarks/servers/{express,fastify,node-http,express-fastify-runtime}.js`.
- See `benchmarks/README.md` for details.

---

## 12. Acceptance Criteria (Definition of Done)

- [ ] Existing Express app runs without modification.
- [ ] Auth middleware does not fail.
- [ ] Morgan logs correctly.
- [ ] Helmet headers are correct.
- [ ] File uploads work via multer (Express lane).
- [ ] Hot routes outperform plain Express.
- [ ] Unsafe routes work correctly on Express lane.
- [ ] No silent behavior changes; refactor instead of patching.

---

## 13. Implementation Status (Checklist)

| Area | Status | Notes |
|------|--------|-------|
| Skeleton (createApp, stubs) | ✅ | |
| ExpressLikeApp (use, METHOD, listen) | ✅ | listen in lifecycle.ts |
| Route locking | ✅ | assertNotLocked in lifecycle |
| Express engine + mount | ✅ | engine.ts, mount.ts, populateExpress |
| Classification (detect, classify) | ✅ | detect.ts, classify.ts |
| Fastify compilation (preHandler, routes) | ✅ | compile.ts, register.ts |
| Request/response adapters | ✅ | fastify/adapters |
| Error handler bridge | ✅ | errorHandler.ts (to be wired to app API) |
| express.json() interception | 🔲 | TODO in middleware.ts / compile |
| res.locals / Router fail loudly | ✅ | assert.ts; Router not wired |
| Tests | 🔲 | test/ added; cases to expand |
| Benchmarks | 🔲 | benchmarks/ added; run and compare |

---

## 14. How to Continue Work

1. Read this spec and `README.md`.
2. Run `npm run build`, `npm test`, `npm run benchmark` (once scripts exist).
3. Pick an unchecked item from §12 or §13.
4. Change only the listed modules; keep structure from §4.
5. Update §13 when done.
