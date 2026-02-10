# Plan: Get fast() Closer to Fastify Speed

Goal: reduce the gap measured by `npm run benchmark:fast-vs-fastify` so that fast() (Fastify lane) is as close as possible to plain Fastify for the same workload, without breaking Express API compatibility.

**Current gap (typical):** ~10–15% with MW=5, ~40–45% with MW=0 (pure route). See `benchmarks/fast-vs-fastify/README.md` and `docs/OPTIMIZATION.md` §5.

---

## Where the cost is (hot path)

Per request on the Fastify lane we:

1. **Adapt request** — reusable req: set `_raw`, url, originalUrl, baseUrl, `_query`, `_params`, `_body`, and assign `query`/`params`/`body`. Getters (protocol, ip, cookies, etc.) are lazy.
2. **Adapt response** — reusable res: set `_reply`, `_req`, `_locals`; return `responseProxy(res, raw)`.
3. **Run middleware chain** (preHandler) — for each applicable middleware, call `fn(req, res, next)`. No-op middleware is just `next()` (one function call each).
4. **Run route handlers** — same loop; final handler usually does `res.json(...)` → our `res.json` → `reply.type().send()`.
5. **No finish waiter** — we do not await `reply.raw.once('finish')`; we return as soon as route handlers have run so the response can flush (avoids keep-alive/Postman logging only on disconnect). Morgan/on-finished still run when the response actually finishes.

So the remaining overhead is: **adapter mutation + proxy indirection + N middleware function calls + our res.json path**.

---

## Initiatives (priority order)

### Tier 1: High impact, reasonable effort

| # | Initiative | What | Why | Trade-off |
|---|------------|------|-----|-----------|
| 1 | **Fast path: zero middleware + single handler** | When a route has no applicable middleware and exactly one handler, skip `runMiddlewareChain` and call the handler directly. Optionally use a “minimal” adapter (only what the handler needs). | MW=0 benchmark is ~43% overhead; a lot of that is the same loop/next machinery for “0 middleware + 1 handler”. A dedicated fast path avoids the loop and next() creation. | Slightly more code paths; must keep behavior identical (req/res still valid). |
| 2 | **Lazy response proxy** | Defer creating or using the response Proxy until the first use of a property/method not on our adapter. Or provide a “light” res that only has status/send/json and delegates the rest on first access. | Every `res.status()`, `res.json()` goes through our adapter; then Proxy delegates others to raw. Reducing indirection on the hottest methods (status, json, send) could help. | Complexity; must not break res.on('finish') etc. |
| 3 | **Avoid setMaxListeners per request** | Call `reply.raw.setMaxListeners(...)` only once per response (e.g. when we first add the finish listener), or skip if limit is already high. | We currently call it every time we’re about to add the finish listener. Tiny win but trivial to do. | None. |

### Tier 2: Medium impact or higher effort

| # | Initiative | What | Why | Trade-off |
|---|------------|------|-----|-----------|
| 4 | **Minimal req for fast path** | For the “zero middleware + single handler” fast path, use a req that only sets `_raw`, url, baseUrl, query, params, body (and getters that derive from _raw). Skip assigning originalUrl, path, etc. until first access. | Fewer assignments per request on the hottest path. | Req must still satisfy any property the handler reads; risk of missing one. |
| 5 | **Inline or fuse middleware + route loop** | Run “applicable middleware” and “route handlers” in a single loop where possible, so we only have one next() and one loop. | Fewer function calls and one less loop. | Structure is different (middleware by path match vs route handlers); may not fuse cleanly. |
| 6 | **Benchmark and trim request getters** | Profile which req properties are used in real apps; make rarely used ones even lazier or skip them in the fast path. | Less work per request for typical handlers (e.g. only url, body, query). | Need data; might complicate adapter. |

### Tier 3: Research / long term

| # | Initiative | What | Why | Trade-off |
|---|------------|------|-----|-----------|
| 7 | **Static hints for “simple” handlers** | Allow a way to mark a handler as “only returns JSON” so we could compile to something like `reply.send(body)` without going through res.json. | Would remove adapter from the response path for that route. | Requires API or convention; easy to get wrong. |
| 8 | **No-op middleware detection** | If we could detect middleware that only calls next() with no side effects, skip calling it and just “advance” the chain. | Would reduce cost of many no-op middleware. | Detection is fragile (e.g. next() in setTimeout); could break apps. |

---

## How we’ll measure

- **Primary:** `npm run benchmark:fast-vs-fastify` (MW=5 and MW=0).
- **Target (aspirational):** MW=5 ratio ≥ 0.95 (≤5% overhead); MW=0 ratio ≥ 0.80 (≤20% overhead). We may not hit these without sacrificing Express compatibility; the plan is to get as close as we can.
- **Regression:** Run `npm run benchmark:fast` and full `npm run benchmark` after changes; no regressions on Express lane or other scenarios.

---

## Implementation order (suggested)

1. **setMaxListeners** (Tier 1.3) — quick win, no behavior change.
2. **Fast path: zero middleware + single handler** (Tier 1.1) — biggest impact for MW=0 and simple routes.
3. **Lazy response proxy / light res** (Tier 1.2) — measure after (2) to see residual overhead from res.*.
4. **Minimal req for fast path** (Tier 2.4) — if (2) is in place, add minimal req only on that path.
5. Re-evaluate with benchmarks, then consider Tier 2.5–2.6 and Tier 3.

---

## Non-goals (to stay aligned with Fastify “same level”)

- **Dropping Express API** — we keep full req/res compatibility; we don’t remove the adapter entirely for the general path.
- **Changing Express semantics** — middleware order, next(), single send, and error handling stay as they are.
- **Plugin replacement** — we don’t replace Fastify plugins (e.g. @fastify/jwt, multipart); “same level” is about our adapter and request path, not about features that are Express vs Fastify by design.

This plan is a living doc: we’ll update it as we implement items and learn from benchmarks.
