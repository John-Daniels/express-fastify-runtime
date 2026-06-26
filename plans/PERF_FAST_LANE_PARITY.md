# Plan (deferred): closing the last fast() → Fastify gap on plain JSON

**Status:** Deferred — not worth doing now. Profiling showed the gap is small and intrinsic, and the
candidate optimizations target things that don't appear in the CPU profile. Revisit only if a
profile on a *real* server (not a laptop) shows the runtime's own code as a meaningful CPU share.

## What we measured (2026-06-25)

The fast-vs-Fastify ratio depends on load shape, and BOTH numbers are real:

| Load shape (plain JSON, MW=5) | fast/Fastify | What it reflects |
|---|--:|---|
| **Realistic** — 50 conns, `pipelining=1` (isolated, warmed, median) | **~0.69×** | per-request latency under concurrency |
| **CPU-saturated** — 50 conns, `pipelining=16` | **~0.936×** | pure compute efficiency (latency hidden) |

So the per-request CPU cost is small (~6% gap when saturated), but at one request per connection that
small overhead becomes latency, and throughput drops to ~0.69×. On middleware/payload-heavy routes
fast() is ~1.0–1.07× Fastify, and it is **always ≥ Express (1.1–1.4×)**.

Note: the truly broken old numbers (fast() at 6,679 req/s, *slower than Express*, JSON-DB 1.41×)
were **throttle/contention artifacts** from the old harness (10 conns, no warmup, single round, all
servers running concurrently). Those are fixed by the new harness (isolation + warmup + median).
What was NOT noise: the ~0.7× plain-JSON ratio under realistic load — that is genuine.

## CPU profile (saturated, fast() plain JSON)

| Frame | Self-time | Note |
|---|--:|---|
| `writevGeneric` (socket write) | 44.6% | unavoidable I/O — identical for Fastify |
| idle / program / GC | ~20% | not compute |
| **all of `dist/` (our code)** | **1.2%** | the entire Express-compat layer |
| `hrtime` (recordStartAt) | 0.4% | only needed by morgan timing |
| `Object.create` adapters | ~0% | does not appear |

**Conclusion (CPU-bound view):** under saturation the ~6% gap is socket I/O + diffuse Node/Fastify
internals, not our adapters — removing allocations/hrtime reclaims <1% of *CPU*.

**But under realistic load (`pipelining=1`) the gap is LATENCY, not CPU.** At one request per
connection, fast()'s per-request wall-time (allocate 2 adapters + run the middleware chain + finish
handling) directly lowers throughput (0.69×). A CPU% profile under-weights this because it measures
where cycles go, not the critical-path latency per request. So the per-request optimizations below
may help the *realistic* ratio more than the saturated profile implies — re-measure at `pipelining=1`
after each change, not just saturated.

## Deferred optimization options (in priority order)

1. **Free hygiene (do anytime, won't move the benchmark):**
   - Skip `recordStartAt`/`process.hrtime()` unless a morgan-style logger is detected at compile
     time (plumb a `needsTiming` flag from `utils/detect.ts` → `createResponseAdapter`).
   - In `response.ts` `json()`, skip the redundant `reply.type('application/json')` for plain-object
     bodies (Fastify defaults Content-Type to application/json when serializing an object).
   - Trim adapter init in `request.ts`/`compile.ts` (the double `baseUrl` set; skip `undefined`
     assigns).
   Expected: <1%. Value: code hygiene, not speed.

2. **decorateRequest / decorateReply (re-evaluate, don't assume):** reuse Fastify's own
   request/reply objects to remove the two per-request `Object.create` allocations + their init.
   This is ~0% of *CPU* (saturated profile), so it won't move the saturated ratio — BUT it removes
   per-request wall-time, which is exactly what limits the *realistic* (`pipelining=1`) throughput,
   so it could lift the 0.69× number. It also carries real parity risk (Fastify `send`/`code`/`type`
   collisions; internal native consumers in `errorHandler.ts`, `mount.ts`). Decision rule: only
   pursue if a `pipelining=1` A/B shows a clear, repeatable gain AND the full parity gauntlet stays
   green on Express 4 + 5. If the gain is marginal, skip — never trade the #1 rule (never break
   Express) for a few %.

3. **Opt-in "turbo" route (the only real lever for the last ~6% on a hot endpoint):** a marker (a
   `turbo()` wrapper or returning a plain object) lets a trivial route return its value so Fastify
   serializes + sends it natively, bypassing Express's `res.json` path entirely → ~1.0× Fastify for
   that route, no global parity risk. Only worth it for a specific proven-hot endpoint; skip at a
   0.936× baseline. Sketch: detect routes whose single handler `return`s a value (no `res.*` call)
   and register them as native Fastify handlers.

## Re-evaluation trigger

Re-profile on production-class hardware under saturation. If `dist/` self-time rises above ~5% there
(e.g., the middleware runner or adapter init dominates on a faster CPU where I/O is less relatively
expensive), revisit options 1 and 3. Otherwise consider fast() at practical parity.
