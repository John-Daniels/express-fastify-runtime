# How We Made express-fastify-runtime Faster

This document explains the principles and techniques used to get the runtime close to (and sometimes ahead of) plain Fastify in benchmarks, while keeping the Express API.

---

## 1. Why It Was Slow at First

Initially, **every request** did extra work:

- **New objects** – `Object.create(raw)` for `req` and `res` on every request.
- **New functions** – New `status`, `send`, `json`, `set` closures for `res` on every request.
- **Two adapt steps** – PreHandler and the route handler each called the adapters, so we adapted twice per request.
- **Heavy use of Promises** – The middleware chain was wrapped in `new Promise` and we used `reply.raw.on('finish')` plus Promise logic in the handler loop.

That added allocation and indirection on the hot path, so we were slower than Express.

---

## 2. Principles We Used

### Principle 1: Zero allocation on the hot path

**Idea:** Avoid creating new objects or functions per request.

**What we did:**

- **Reusable req/res** – One shared “req” and one shared “res” per process. Each request only updates internal fields (`_raw`, `_query`, `_params`, `_body`, `_reply`) and reuses the same object. No `Object.create(raw)` and no new closures per request.
- **Adapters** – `createRequestAdapter()` and `createResponseAdapter()` return a single function that mutates and returns that shared object. The handler always receives the same req/res instances; only their contents change.

**Effect:** No per-request allocation for the Express-like req/res.

---

### Principle 2: Adapt once per request

**Idea:** Run the adapter logic only once per request, not once per “layer”.

**What we did:**

- PreHandler adapts and stores the result on the Fastify request: `request[kExpressReq] = req`, `request[kExpressRes] = res`.
- The route handler reads `req` and `res` from the request instead of calling the adapters again.

**Effect:** Half the adapter work per request (one adapt instead of two).

---

### Principle 3: Sync-first handler loop

**Idea:** Use a simple loop and only use Promises when the handler is actually async.

**What we did:**

- Middleware and route handlers run in a `while` loop.
- We call each handler with `(req, res, next)`. We only `await` when the handler returns a thenable (e.g. a Promise).
- We use an index-based `next`: when `next()` is called we increment an index; we don’t use a separate “nextCalled” boolean.

**Effect:** Fewer Promise allocations and less bookkeeping when handlers are sync.

---

### Principle 4: One Promise only when we have to wait

**Idea:** Don’t wrap the whole chain in a big Promise; only create a Promise when we need to wait for the response to finish.

**What we did:**

- After running all handlers we check `reply.sent`. If the response was already sent we return. Otherwise we wait with a single `new Promise` + `reply.raw.once('finish', resolve)`.

**Effect:** One Promise per request only when we actually wait for the response to finish.

---

### Principle 5: Match Express semantics, not object shape

**Idea:** Keep the same *behavior* as Express (order of middleware, `next()`, send once) without copying Express’s internal object hierarchy.

**What we did:**

- We don’t use `Object.create(raw)` so our req/res don’t inherit from Node’s `IncomingMessage`/`ServerResponse`. We provide the same *surface* (e.g. `req.get`, `req.query`, `res.status().send()`) via a small, fixed set of methods on the shared objects. That keeps the hot path simple and predictable.

**Effect:** Same API for app code, with less overhead than a full prototype chain.

---

## 3. Why We Return `{ close }` and “Close the Server”

### Does Express call `server.close()` or `process.exit()`?

**No.** In Express:

- `app.listen(port, callback)` returns an **`http.Server`**.
- You keep that reference and call **`server.close(callback)`** when you want to stop the server (e.g. in tests or on SIGINT).
- Express does **not** call `process.exit()`. Your process exits when the event loop is empty (e.g. after you close the server and have no other work).

So: **closing the server is something *you* do when you’re done; Express just gives you the server so you can.**

### What we do in express-fastify-runtime

- Our **`listen()`** is async (Fastify starts listening asynchronously), so we return a **Promise** that resolves to a **server-like object** with:
  - **`close()`** – stops the server (like `http.Server#close`).
  - **`address()`** – returns the same shape as `http.Server#address()` so you can inspect port/host.

So the pattern is the same as Express: “get a server from `listen`, call `server.close()` when you want to shut down.” We don’t call `process.exit()` anywhere in the runtime.

### Why you might see `process.exit(0)` in examples

In **examples or benchmarks** (e.g. a small script that only runs the server), after calling `server.close()` the process might still stay alive (e.g. open handles). So some sample code does:

```js
process.on('SIGINT', () => server.close().then(() => process.exit(0)));
```

That’s a **choice of the example**, not part of the runtime. Express apps often do the same when they want the process to exit on Ctrl+C after closing the server. The runtime itself only provides `server.close()`.

---

## 4. Summary Table

| Principle              | What we did                          | Why it helps                    |
|------------------------|--------------------------------------|---------------------------------|
| Zero alloc hot path    | Reusable req/res, mutate per request | Less GC, fewer function calls   |
| Adapt once             | Store req/res on request in preHandler| Half the adapter work           |
| Sync-first loop        | `while` + await only on thenable     | Fewer Promises, simpler path    |
| One wait Promise       | Single `finish` Promise when needed  | Fewer allocations               |
| Same API, minimal shape| Small req/res surface, no prototype chain | Predictable, fast property access |

---

## 5. Why fast() isn't exactly as fast as plain Fastify

At **compile time** we turn Express routes into Fastify routes. So the route itself is a normal Fastify route. But **per request** we still run:

1. **Adapter** — build Express-like `req`/`res` and attach to the Fastify request (reusable objects, but the adapter function still runs).
2. **Middleware chain** — run the N Express middleware in the preHandler via `runMiddlewareChain` (each middleware is a real function call; plain Fastify uses N empty hooks).
3. **Handler via adapter** — `res.json({ ok: true })` goes through our `res.json` → `reply.type().send()`, so one extra layer vs Fastify's direct `return { ok: true }`.
4. **Finish waiter** — we wait on `reply.raw.once('finish')` so we don't return until the response is flushed (Express semantics). One Promise + one listener per request.

So the **workload** is the same (N no-ops + one JSON response), but the **path** is "Fastify + adapter + Express middleware runner". That's why fast() is typically a few percent slower than plain Fastify in the **fast-vs-fastify** benchmark. We optimize to keep that gap small (see principles above); we don't remove the adapter entirely because we need full Express API compatibility.

To compare directly: `npm run benchmark:fast-vs-fastify` (see `benchmarks/fast-vs-fastify/README.md`). For a **plan to close the gap** (fast path, lazy res, setMaxListeners, etc.), see **`docs/PLAN_FASTIFY_CLOSER.md`**.

---

## 6. How to Run Benchmarks

From the project root:

```bash
npm run benchmark
```

You’ll see req/s and latency for Express, Fastify, raw Node `http`, and express-fastify-runtime. The runtime is tuned so its numbers are in the same range as Fastify (and often ahead of plain Express). To compare fast() vs Fastify with the same workload: `npm run benchmark:fast-vs-fastify` (use `--minimal` or `MW=0` for pure route overhead).
