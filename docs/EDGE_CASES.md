# Edge cases and compatibility

This doc lists edge cases that can break “drop-in Express” behavior. Correctness here matters as much as throughput.

---

## Tier 1 — Do not ship without these

### 1. `next(err)` propagation (sync + async)

- Thrown error vs `next(err)`; async middleware throwing or returning rejected promise.
- Error middleware (4-arg) must skip normal middleware and preserve order.
- **Status:** Error middleware and `next(err)` need explicit handling in the Fastify lane (compile/runRouteHandlers). Currently errors may not jump to error handlers like Express.

### 2. Multiple `res.send()` / `res.json()` / `res.end()`

- First send wins; subsequent must not crash the process.
- **Status:** Depends on adapter and Fastify reply; double-send should be guarded or documented.

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

---

## Benchmark / test additions (correctness first)

- `benchmarks/edge-cases/` or tests: errors (throw, next(err), error handler), aborts, double-send, headersSent, originalUrl/baseUrl/path, streaming, redirect, trust-proxy.
- Each: assert no crashes and correct behavior before measuring throughput.

This file is the single checklist for edge-case correctness. Update as features are implemented or downgraded.
