# fast(app) — Production checklist: what works, what fails, what’s missing

Use this list to decide if your Express app is safe to run with `fast(app)` in production. **If your app uses something in “Will fail” or “Missing (will break at runtime)”, either avoid it or keep that path on the Express lane (e.g. don’t rely on it being compiled to the Fastify lane).**

---

## Will fail or break at runtime

These will throw, return wrong behavior, or 500 if you use them in routes/middleware that run on the Fastify lane or through the adapted req/res.

| Feature | Why it fails | Workaround |
|--------|---------------|------------|
| **res.locals** | Not implemented; runtime fails loudly if detected | Don’t use `res.locals`; pass data via `req` or closure. |
| **res.redirect()** | Not on our res adapter | Use Express lane for that route, or call `res.status(302).set('Location', url).end()` (or use raw `reply.redirect()` in a Fastify-only handler). |
| **res.sendFile()** / **res.download()** | Not implemented | Use Express lane for that route, or serve files with Fastify (e.g. `@fastify/static`) and keep the rest on fast(app). |
| **res.headersSent** | Not mirrored on adapter | Middleware that checks `res.headersSent` may behave wrong. Prefer not relying on it, or keep that code on Express lane. |
| **req.path** | Not set on request adapter | Use `req.url` (path + query) or parse yourself. Router uses `req.url` / `req.baseUrl`; path can be derived. |
| **req.cookies** / **req.signedCookies** | Not implemented | Use Express lane for cookie-heavy routes, or add a Fastify cookie plugin and read from raw request. |
| **req.ip** / **req.ips** / **req.protocol** / **req.secure** | Not implemented (trust proxy not wired) | Use Express lane, or read from `request.raw` / headers in a custom middleware. |
| **res.cookie()** / **res.clearCookie()** | Not implemented | Use Express lane for that response, or set headers manually with `res.set('Set-Cookie', ...)`. |
| **express.static()** | Not mapped to Fastify static | Use Express lane for static (e.g. mount static before other routes so they hit Express), or use `@fastify/static` separately. |
| **express.urlencoded()** / **express.raw()** / **express.text()** | Not intercepted like express.json() | Use Express lane for those routes, or add Fastify body parser for the content type you need. |
| **app.param()** / **router.param()** | Not supported | Use regular middleware instead; keep param-style routes on Express lane if you rely on param middleware. |
| **app.engine()** / **res.render()** | Not implemented | Use Express lane for view rendering. |
| **app.route(path)** (chained route API) | Not supported | Use `app.get(path, ...)` etc. |
| **RegExp / array routes** (e.g. `app.get(/^\/foo/, ...)`) | Not flattened to Fastify; only string paths are compiled | Request hits Express lane (notFoundHandler). Works but no Fastify speed for that route. |
| **Multiple 4-arg error handlers** | Only the **first** Express 4-arg handler is wired to Fastify’s setErrorHandler | Put the “main” error handler first; others won’t run for errors that go to Fastify’s error handler. |

---

## Behave differently (might surprise you)

| Feature | Difference | Recommendation |
|--------|------------|----------------|
| **next(err)** in Fastify lane | Becomes a throw; Fastify’s error handler runs, then your single Express 4-arg handler if registered | Rely on one global Express error handler; avoid depending on “next” error handler order in Fastify lane. |
| **Thrown errors (Express 5 style)** | In Express lane, Express 5 passes thrown errors to 4-arg middleware. In Fastify lane, throw is caught by Fastify then your wired 4-arg handler. | Use one 4-arg handler that does `res.status(500).json({ error: err.message })` (or your normal error responder). |
| **Double res.send() / res.json()** | Second send can trigger Fastify “already sent” or undefined behavior | Ensure each request path sends at most once. |
| **Streaming (res.write / pipe(res))** | Fastify lane uses reply.send(); streaming is not mapped 1:1 | Use Express lane for streaming responses, or implement with Fastify streams. |
| **404** | Unhandled requests go to Express via setNotFoundHandler (same app, adapted req/res). | 404 behavior is correct; ensure your app’s 404 handler doesn’t rely on unsupported res/req APIs. |
| **req.originalUrl / req.baseUrl / req.url** | Set and **writable** in the notFoundHandler adapter so Express router can mutate them. In Fastify lane they come from the request adapter used there. | Use as normal for routing; avoid mutating them in application code if you rely on them later. |

---

## Supported and safe for production (with caveats)

- **app.use(fn)**, **app.use(path, fn)**, **app.METHOD(path, ...handlers)**, **app.all(path, ...handlers)**
- **express.Router()** with string paths and middleware (load express-fastify-runtime before creating the app so Layer is patched)
- **express.json()** — intercepted to Fastify’s JSON parser
- **req.get()** / **req.header()**, **req.query**, **req.params**, **req.body**, **req.method**, **req.url**, **req.headers**, **req.originalUrl**, **req.baseUrl**
- **res.status()**, **res.send()**, **res.json()**, **res.set()** / **res.setHeader()**
- **listen()** — use `fastApp.listen({ port }, cb)` or `fastApp.server.listen(port, cb)` (wrapper delegates to Fastify)
- **WebSockets / Socket.IO** — attach to `fastApp.server` after creating the app
- **Single 4-arg error middleware** — wired for both Express lane and Fastify lane (with the Fastify-lane caveat in EDGE_CASES)
- **Early return (no next())** — chain stops as in Express

---

## Before you ship

1. **Audit your app** for everything in the “Will fail” and “Missing” table; remove or move those paths to Express lane.
2. **Don’t use res.locals**; fail loudly is on so you’ll catch it in dev.
3. **Use one global 4-arg error handler** and ensure it only uses supported res APIs (status, json, set).
4. **Load express-fastify-runtime before Express** (and before creating routers) so router Layer is patched and flattening works.
5. **Test** 404, errors (throw and next(err)), and any middleware that checks headersSent or uses cookies/redirect/sendFile.
6. **Run your test suite** against `fast(app)`; add a smoke test that hits the main routes and error path.

For full feature tables see **EXPRESS_FEATURES.md** and **EDGE_CASES.md**.
