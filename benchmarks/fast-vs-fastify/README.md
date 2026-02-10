# fast() vs Fastify benchmark

Same workload for both: **N no-op middleware/hooks + GET / returning JSON.**

- **Fastify:** `N` empty `preHandler` hooks + one route that returns `{ ok: true }`.
- **fast(express):** `N` Express middleware `(req, res, next) => next()` + one route `res.json({ ok: true })`, all compiled to the Fastify lane.

So we’re comparing **plain Fastify** vs **Fastify + our adapter layer** when the app shape is identical.

## Run

```bash
npm run build
npm run benchmark:fast-vs-fastify
```

Options:

- **`--minimal`** — use `MW=0` (no middleware). Measures pure “one route, one JSON response” overhead (adapter + handler path only).
- **`MW=0`** / **`MW=5`** / **`MW=10`** — set middleware count (default 5).
- **`DURATION=3`** — seconds per run (default 5).

Example:

```bash
node benchmarks/fast-vs-fastify/run.js --minimal
MW=10 DURATION=3 node benchmarks/fast-vs-fastify/run.js
```

## Why isn’t fast() exactly as fast as Fastify?

At **compile time** we turn Express routes into Fastify routes, so the *route* is a normal Fastify route. But **per request** we still do:

1. **Request/response adaptation** — build Express-like `req`/`res` (reusable objects, but we still run the adapter and attach them to the Fastify request).
2. **Express middleware in the preHandler** — run the N middleware in our `runMiddlewareChain` (each `next()` is a sync step). Plain Fastify uses N empty hooks; we run N real function calls that call `next()`.
3. **Route handler via adapter** — your handler calls `res.json({ ok: true })`; that goes through our `res.json` which calls `reply.type('application/json').send(body)`. So one extra layer vs Fastify’s direct `return { ok: true }`.
4. **Finish waiter** — we use `reply.raw.once('finish', resolve)` so we don’t return from the handler until the response is flushed (for correct Express semantics). That’s one Promise + one event listener per request.

So the **workload** is the same (N no-ops + one JSON response), but the **implementation** is “Fastify + adapter + Express middleware runner”. The benchmark measures that gap. Goal: keep overhead small (typically single-digit %) so fast() is still much faster than Express and close to Fastify.

**Typical results:** With `MW=5`, fast() is often ~10–15% slower than Fastify (ratio ~0.85–0.9). With `MW=0` (pure route, no middleware), the gap is larger (~40–45%) because the only cost is our adapter + finish waiter; that's the "pure adapter overhead" to optimize if we want to get closer to Fastify.

## What “same level” would require

To match Fastify exactly we’d have to:

- Avoid the adapter on the hot path (e.g. generate Fastify handlers that call `reply.send()` directly from your handler’s return value) — possible only for trivial handlers.
- Run “no-op” middleware as no-ops (e.g. skip the middleware runner when we detect a no-op) — fragile and not general.
- Or accept a small overhead in exchange for full Express API compatibility.

So we optimize for **minimal overhead** (see `docs/OPTIMIZATION.md`) and **correctness**; the benchmark keeps us honest. For a concrete **plan to get closer to Fastify** (fast path, lazy res, etc.), see **`docs/PLAN_FASTIFY_CLOSER.md`**.
