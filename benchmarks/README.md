# Benchmarks

Compare **Express**, **Fastify**, **Node.js http**, and **express-fastify-runtime** under the same workload.

## Prerequisites

- Node.js >= 18
- Dependencies installed (`npm install` in repo root)

`npm run benchmark` and `npm run benchmark:servers` run `npm run build` first so results reflect the built runtime.

## Scenario

Same app shape for all four:

- **N** middleware (configurable via `MW=5`)
- One **GET /** route that returns `{ ok: true }`

So we measure: middleware chain + single JSON response.

## Methodology (how these numbers avoid lying)

All runners share one harness — [`benchmarks/lib/bench.js`](./lib/bench.js) — so the method is
identical everywhere:

- **Warmup** — a discarded warmup run per server so we never measure cold JIT.
- **Median of N rounds** — rejects thermal/scheduling outliers (a single sample on a laptop can
  swing 2×).
- **Many connections** (`conns=50`, `pipelining=1` by default) — realistic concurrent load that
  isn't loopback-idle-bound. (At the old `conns=10, pipelining=1`, the server sat ~30% idle and the
  result was scheduling noise — that's what once made fast() look *slower than Express*.)
- **Cooldown** between servers — no thermal/CPU carryover from the previous target.

**How to read the results (sanity checks):**

1. **fast() should be ≥ Express, always.** If not, the machine is throttling — rerun idle.
2. **fast() ≈ `express-fastify-runtime` (createApp).** They share the compile/adapter engine, so
   they must track each other (within ~5%). A large gap = a throttled run, not a real difference.
3. **Latency should be uniform** across stacks for in-memory routes. One outlier row = that row
   throttled.

> On a laptop, prefer running a single benchmark in isolation. The full `summary` suite runs ~10
> sub-benchmarks back-to-back; even with cooldowns, sustained load can heat the CPU. For quotable
> numbers use `benchmarks/table/run.js` (interleaved warmup + median).
>
> **fast vs Fastify depends on load shape — and both numbers are real.**
> Under realistic load (`pipelining=1`, the default) fast() is **~0.7× Fastify** on the simplest
> plain-JSON route, **~1.0–1.07×** on middleware/payload-heavy routes, and **always ≥ Express
> (1.1–1.4×)**. The plain-JSON gap is fast()'s small per-request overhead (adapter + middleware
> runner): at one request per connection it shows up as latency, so throughput drops. Under CPU
> saturation (`PIPELINING=16`) that latency is hidden and fast() rises to **~0.94× Fastify** — the
> pure-compute efficiency view. We default to the realistic (pipelining=1) view; quote the saturated
> one only when you mean "max CPU capacity."

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
- `CONNECTIONS` — concurrent connections (default `50`)
- `PIPELINING` — requests in flight per connection (default `1` = realistic; set higher to CPU-saturate small in-memory routes — **don't** pipeline upload/large-body benchmarks)
- `DURATION` — seconds per measured round (default `3`)
- `WARMUP` — seconds of discarded warmup per server (default `1`)
- `ROUNDS` — measured rounds; the median is reported (default `3`)
- `COOLDOWN` — ms pause between servers (default `750`)

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

## fast() best practice

For **fast(expressApp)** to compile routes to the Fastify lane (especially with `express.Router()` and `router.use(path, fn)`), load the runtime **before** Express so the Router Layer is patched:

```js
import "express-fastify-runtime";  // or import "../../dist/index.js" in benchmarks
import express from "express";
import { fast } from "express-fastify-runtime";
const app = express();
// ...
const fastify = fast(app);
```

All `*-fast` benchmark files use this order so fast() numbers are comparable to createApp.

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

Scenarios: baseline (5 mw, GET /), many-routes (30 routes), deep-middleware (25 mw), json-body (POST 1KB), headers/cookies, redirect, send-string, **express-lane** (RegExp route so every request hits the Express lane / proxy). The report prints req/s for Express vs fast() and a ratio; ratio > 1 means fast() is faster. **We keep the Express lane at least as fast as raw Express** (ratio ≥ 1) so there is no downside when a request falls through to the proxy.

---

## fast() vs Fastify (same workload)

Measures why fast() isn’t quite as fast as plain Fastify when the app shape is identical (N no-op middleware + GET / JSON). Same workload on both sides; the gap is our adapter + middleware runner + finish waiter.

```bash
npm run build
npm run benchmark:fast-vs-fastify
```

Use `--minimal` or `MW=0` to measure pure route overhead (no middleware). See `benchmarks/fast-vs-fastify/README.md` and `docs/OPTIMIZATION.md` (§5) for why there is a gap and what we optimize.

---

## When Express wins (IO-heavy, large payloads)

Express has the **smallest per-request stack** (no Fastify, no adapters). So it can win when:

- **IO-heavy handlers** (e.g. LowDB-like benchmark: sync file read/write per request). The handler dominates latency; our fixed overhead (adapters, Fastify lifecycle) is a larger share of total time, so we do fewer req/s. Fastify can also be slower than Express there for the same reason.
- **Very large payloads (1MB+)** in some conditions. Both we and Fastify buffer the body; Express’s minimal pipeline can come out ahead depending on body parser and connection handling.

We optimize for the common case: **fast handlers** (servers, routes, CRUD with in-memory or fast DB) and **small/medium payloads**, where we match or beat Express and get close to Fastify.

---

## Why Fastify sometimes wins (and when we match)

- **Payloads (1KB / 1MB JSON):** We use Fastify’s native JSON parser and map it to `req.body`; we skip `express.json()` on the Fastify path. So we are within ~±20% of plain Fastify for large JSON.
- **Uploads (multipart):** Our benchmark uses **multer** (Express lane). Multipart is Express-required, so the request is proxied to the real Express app. Plain Fastify uses `@fastify/multipart`, which is native and much faster. The gap is expected: we don’t reimplement multer on Fastify.
- **Auth (JWT):** Our benchmark uses the same **userland** `jwt.verify()` middleware on all stacks. Plain Fastify uses `@fastify/jwt` with `request.jwtVerify()`, which is a native plugin. So Fastify wins on auth because of the plugin, not because our adapter is slow.
- **CRUD / middleware stack:** We are close to Fastify when the workload is “middleware + route”; any gap is from adapter cost and sync middleware loop, which we keep minimal (see `docs/OPTIMIZATION.md`).
