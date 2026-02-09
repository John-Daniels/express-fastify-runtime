# Benchmarks

Compare **Express**, **Fastify**, **Node.js http**, and **express-fastify-runtime** under the same workload.

## Prerequisites

- Node.js >= 18
- Dependencies installed (`npm install` in repo root)
- Build the runtime: `npm run build`

## Scenario

Same app shape for all four:

- **N** middleware (configurable via `MW=5`)
- One **GET /** route that returns `{ ok: true }`

So we measure: middleware chain + single JSON response.

## Run one server (manual)

Start a server, then use `curl` or a load tool against it.

```bash
# Express (port 3001)
node benchmarks/servers/express.js

# Fastify (port 3002)
node benchmarks/servers/fastify.js

# Node http (port 3003)
node benchmarks/servers/node-http.js

# express-fastify-runtime (port 3004)
node benchmarks/servers/express-fastify-runtime.js
```

## Run benchmark suite

Uses **autocannon** to hit each server in turn (start server in background, run autocannon, stop server).

```bash
npm run benchmark
```

Or run a single target:

```bash
npm run benchmark -- --express
npm run benchmark -- --fastify
npm run benchmark -- --node-http
npm run benchmark -- --runtime
```

## Environment

- `MW` — number of middleware (default `5`)
- `PORT` — base port; each server uses PORT, PORT+1, PORT+2, PORT+3 (default 3001)

## Output

You get requests/sec and latency percentiles for each stack so you can compare Express vs Fastify vs raw http vs express-fastify-runtime.

---

## Routes benchmark (Router + router.use)

Compares **Express with Router** vs **express-fastify-runtime with Router** using the same shape as the integration test: `router.use('/auth', ...)` and `router.get('/auth/bar', ...)` mounted at `/api`. Hits **GET /api/auth/bar**.

```bash
npm run build
npm run benchmark:routes
```

Or run a single target:

```bash
npm run benchmark:routes -- --express
npm run benchmark:routes -- --runtime
```

Same env: `MW`, `PORT`, `DURATION`.

---

## fast() scenarios (where fast() wins or fails)

Benchmark **fast(expressApp)** across multiple scenarios to see where it beats plain Express and where it degrades or hits the Express lane.

```bash
npm run build
npm run benchmark:fast
```

Options:

- `--express` — run only Express (no fast())
- `--fast` — run only fast()
- `--scenario=NAME` — run one scenario (e.g. `--scenario=baseline`, `--scenario=express-lane`)
- `DURATION=5` — seconds per scenario (default 3)

Scenarios: baseline (5 mw, GET /), many-routes (30 routes), deep-middleware (25 mw), json-body (POST 1KB), headers/cookies, redirect, send-string, express-lane (RegExp route so every request hits Express). The report prints req/s for Express vs fast() and a ratio; ratio > 1 means fast() is faster.

---

## Why Fastify sometimes wins (and when we match)

- **Payloads (1KB / 1MB JSON):** We use Fastify’s native JSON parser and map it to `req.body`; we skip `express.json()` on the Fastify path. So we are within ~±20% of plain Fastify for large JSON.
- **Uploads (multipart):** Our benchmark uses **multer** (Express lane). Multipart is Express-required, so the request is proxied to the real Express app. Plain Fastify uses `@fastify/multipart`, which is native and much faster. The gap is expected: we don’t reimplement multer on Fastify.
- **Auth (JWT):** Our benchmark uses the same **userland** `jwt.verify()` middleware on all stacks. Plain Fastify uses `@fastify/jwt` with `request.jwtVerify()`, which is a native plugin. So Fastify wins on auth because of the plugin, not because our adapter is slow.
- **CRUD / middleware stack:** We are close to Fastify when the workload is “middleware + route”; any gap is from adapter cost and sync middleware loop, which we keep minimal (see `docs/OPTIMIZATION.md`).
