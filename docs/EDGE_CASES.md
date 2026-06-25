# Edge cases and compatibility

This doc lists edge cases that can break “drop-in Express” behavior. Correctness here matters as much as throughput.

---

## Tier 1 — Do not ship without these

### 1. `next(err)` propagation (sync + async)

- Thrown error vs `next(err)`; async middleware throwing or returning rejected promise.
- Error middleware (4-arg) must skip normal middleware and preserve order.
- **Status:** In the Fastify lane, `next(err)` throws; Fastify’s error handler runs. **fast()** wires the first Express 4-arg error middleware (from the app’s router stack) via `setErrorHandler(wrapErrorHandler(...))`, so errors from Fastify lane routes reach that handler. **createApp()** does not yet wire Express error middleware; errors in the Fastify lane are handled by Fastify’s default.

### 2. Multiple `res.send()` / `res.json()` / `res.end()`

- First send wins; subsequent must not crash the process.
- **Status:** On the **Express lane** (raw Node res), a second send throws "Cannot set headers after they are sent to the client". On the Fastify lane the adapter uses Fastify’s reply (single send). **Mitigation:** In global/4-arg error handlers, always guard with `if (!res.headersSent)` before calling `res.status(...).json(...)` so you don’t send again after the route already responded (e.g. error thrown in async code after a successful send).

### 3. `res.headersSent`

- Many middlewares use `if (res.headersSent) return next(err)`.
- **Status:** Not yet mirrored on our res adapter; should stay in sync with Fastify reply state.

### 4. `req.originalUrl`, `req.baseUrl`, `req.path`

- Routers and auth/logging depend on these; nested routers, mounted paths, trailing slashes, query preservation.
- **Status:** Partially available via raw request; ensure they are set correctly for mounted/router paths.

### 5. Middleware order with early return

- If one middleware does `res.status(401).end()` and never calls `next()`, the rest of the chain must not run.
- **Status:** Handled by `nextCalled` in compile (we stop when next() is not called).

---

## Tier 2 — Real world, often missed

### 6. Request aborts / client disconnects

- `req.on('close')`, `req.aborted`; disconnect during upload, body parse, or auth.
- **Status:** Must stop chain, avoid leaks, avoid writing to closed socket.

### 7. Streaming responses

- `res.write()` / `res.end()`, `stream.pipe(res)`; backpressure, no double headers.
- **Status:** Streaming goes through Express lane when detected; Fastify lane uses reply.send.

### 8. `res.redirect()`

- Default 302; 301/307; relative vs absolute; already-sent headers.
- **Status:** Not yet implemented on our res adapter; document or add.

### 9. `res.sendFile()` / static

- Must fail gracefully and be documented if not implemented.
- **Status:** Not implemented; document in EXPRESS_FEATURES.

### 10. `express.json()` + raw body

- Some apps use `req.rawBody` (e.g. webhooks). Document or support.
- **Status:** Not exposed; document.

---

## Tier 3 — Will bite eventually

### 11. `req.ip`, `req.ips`, trust proxy

- Behind Nginx/Cloudflare; `x-forwarded-for`, `req.protocol`, `req.secure`.
- **Status:** Not yet.

### 12. `res.locals`

- Very common; must persist across middleware. **Status:** Fail loudly in v1.

### 13. Cookie edge cases

- Signed, clear, overwrite, sameSite, secure, httpOnly. **Status:** Not yet.

### 14. Router param middleware

- `router.param('id', ...)`; ordering and error handling. **Status:** Not yet.

### 15. `app.use('*', …)` and regex routes

- If unsupported, fail loudly; do not silently skip. **Status:** RegExp paths → Express lane + dev warn.

---

## Production guarantees

- **Memory:** No leaks across requests (closures, listeners, hooks).
- **Event listeners:** No `process.on` or unclosed `req.on` per request.
- **Middleware compatibility:** Explicitly test cors, passport, express-session, multer, compression, rate-limit; document which work or fail.

---

## fast(app) API

- **fastApp.server** is the Node HTTP server; you can attach WebSockets, Socket.IO, etc. to it. **server.listen(port, callback)** is supported: it is wrapped to delegate to Fastify’s `listen()` so 404 and other internals work. Use either `fastApp.listen({ port }, cb)` or `server.listen(port, cb)`.

### Error handling with fast()

- **Express 4-arg error middleware:** If the Express app has at least one `(err, req, res, next)` handler (e.g. `app.use((err, req, res, next) => { ... })`), **fast()** registers it with Fastify’s `setErrorHandler`. Only the **first** such handler in the app’s router stack (middleware layers only) is used.
- **When the request is handled by the Express lane** (notFoundHandler → `expressApp(req, res, next)`): we pass **adapted** req/res (with `.status()`, `.json()`, `.setHeader()`, etc.), so Express error middleware receives a working `res` and can do `res.status(500).json({ error: err.message })` correctly.
- **When the error comes from the Fastify lane** (route registered on Fastify, handler calls `next(err)`): the Express error handler is invoked with an adapted `res` from `errorHandlerRes(reply)`. In some environments a downstream serialization step can still produce a different error before the handler runs; if you need reliable error payloads for Fastify-lane routes, catch errors in the route and call your error middleware via the Express lane (e.g. by not registering that route on Fastify so the request falls back to Express).
- **createApp():** Does not wire Express error middleware; Fastify’s default error handling applies for errors in the Fastify lane.

### Features that break or differ with fast()

- **Production checklist:** See **FAST_PRODUCTION_CHECKLIST.md** for a full list of Express features that will fail, are missing, or behave differently with `fast()`.
- Same as **createApp()** for the Fastify lane: streaming, `res.redirect`, `res.sendFile`, `res.locals`, cookie/trust-proxy edge cases, etc. (see Tier 2–3 above).
- **404:** Unhandled requests go to Express via `setNotFoundHandler` (same as createApp).
- **Errors:** With fast(), the first Express error middleware is used when present; otherwise Fastify’s default error response is used. Errors that reach Express via the notFoundHandler path get an adapted `res`; errors from the Fastify lane use an adapted `res` in the error handler, but see the note above for edge cases.
- **Server lifecycle:** Use `fastApp.listen()` or `fastApp.server.listen()` (wrapped); do not call the raw Node server’s `listen` before attaching WebSockets if you rely on the wrapper.

---

## Benchmark / test additions (correctness first)

- `benchmarks/edge-cases/` or tests: errors (throw, next(err), error handler), aborts, double-send, headersSent, originalUrl/baseUrl/path, streaming, redirect, trust-proxy.
- Each: assert no crashes and correct behavior before measuring throughput.

This file is the single checklist for edge-case correctness. Update as features are implemented or downgraded.
