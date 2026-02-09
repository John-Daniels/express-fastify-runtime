# How the Express lane works (fast(app))

When you call `fast(expressApp)`, every request is handled by **either** the Fastify lane (compiled routes) **or** the Express lane (the full Express app). The Express lane is just “call the real Express app when Fastify didn’t match anything.”

---

## Request flow (one diagram)

```
                    HTTP Request
                         │
                         ▼
              ┌──────────────────────┐
              │   Fastify (single    │
              │   entry point)       │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  Route matching      │
              │  (GET /api/users,     │
              │   POST /login, …)    │
              └──────────┬───────────┘
                         │
           ┌─────────────┴─────────────┐
           │                           │
      MATCHED                     NOT MATCHED
           │                           │
           ▼                           ▼
  ┌─────────────────┐       ┌─────────────────────┐
  │  FASTIFY LANE   │       │   EXPRESS LANE      │
  │                 │       │                     │
  │  Compiled       │       │  setNotFoundHandler │
  │  route runs     │       │  runs → we call     │
  │  (our handler   │       │  expressApp(req,    │
  │   + adapters)   │       │    res, next)       │
  └────────┬────────┘       └──────────┬──────────┘
           │                           │
           │                           │  req/res are *adapted*:
           │                           │  • req = adaptRequest(request)
           │                           │  • res = adaptResponse(reply)
           │                           │  so Express sees .status(), .json(), etc.
           │                           │
           ▼                           ▼
  ┌─────────────────┐       ┌─────────────────────┐
  │  reply.send()   │       │  Express runs its    │
  │  (or error      │       │  full stack:         │
  │   handler)      │       │  middleware, routes, │
  │                 │       │  error middleware.   │
  │                 │       │  Writes go through   │
  │                 │       │  adapted res →       │
  │                 │       │  reply.raw / reply   │
  └─────────────────┘       └─────────────────────┘
```

So:

- **Fastify lane** = a route was registered from `introspectExpressApp` and Fastify matched it; our compiled handler runs (with adapted req/res attached to the request).
- **Express lane** = no Fastify route matched → Fastify’s **notFoundHandler** runs → we call the **real Express app** with **adapted** req/res.

---

## Where it’s implemented

### 1. Who runs first?

`fast.ts` does (in order):

1. **Introspect** the Express app → list of route/middleware entries.
2. **Classify** them (safe vs not).
3. **Register** safe ones as real Fastify routes (`registerCompiledRoutes`) → **Fastify lane**.
4. **Mount** the full Express app as the **notFoundHandler** (`mountExpress`) → **Express lane**.

So for every request, Fastify’s router runs first. If it matches a registered route, that’s the Fastify lane. If it matches nothing, the notFoundHandler runs and that’s the Express lane.

### 2. Express lane = notFoundHandler + expressApp(req, res, next)

In `src/express/mount.ts`:

```ts
fastify.setNotFoundHandler(async (request, reply) => {
  const req = adaptRequest(request);   // FastifyRequest → Express-like req
  const res = adaptResponse(reply, request);  // FastifyReply → Express-like res

  expressApp(req, res, (err?: Error) => {
    if (err && !reply.sent) {
      reply.send(err);
      return;
    }
    if (!reply.sent) {
      reply.code(404).send();
    }
  });
});
```

- **req** and **res** are **adapters**: they look like Express req/res (`.get()`, `.url`, `.status()`, `.json()`, `.setHeader()`, etc.) but under the hood they use `request.raw` / `reply` so that when Express calls `res.status(500).json({ ... })`, we actually call Fastify’s `reply.code(500).send(...)`.
- We pass the Express app **as the request listener**: `expressApp(req, res, next)`. So the **entire** Express stack runs (all middleware and routes Express would run for that req/res).
- The **next** callback is the “done” callback: if Express calls `next(err)`, we send the error with `reply.send(err)` (and only if the reply wasn’t already sent). If Express finishes without calling next with an error and hasn’t sent a response, we send 404.

So “Express lane” = **one** call into the real Express app, with adapted req/res and a single done callback. No separate server; it’s all inside the notFoundHandler.

### 3. Why adapted req/res?

Express expects `res.status()`, `res.json()`, `res.setHeader()`, etc. The raw Node `IncomingMessage` / `ServerResponse` don’t match that API exactly, and we’re not passing the raw `reply.raw` — we’re passing objects that **implement** the Express-style API and delegate to the Fastify request/reply. So:

- **Request adapter** (`createRequestAdapter`): provides `req.url`, `req.baseUrl`, `req.originalUrl` (writable so the Express router can mutate them), `req.method`, `req.get()`, `req.query`, `req.params`, `req.body`, etc., from the Fastify request (and raw).
- **Response adapter** (`createResponseAdapter`): provides `res.status()`, `res.send()`, `res.json()`, `res.set()`, `res.setHeader()`, etc., and each call does the right thing on `reply` (e.g. set status, send body).

So when a route on the **Express lane** does `res.status(500).json({ error: err.message })`, that goes through the adapter and ends up as `reply.code(500).send({ error: err.message })` — one response, no second write.

---

## When does a request use the Express lane?

A request uses the **Express lane** when **no Fastify route matched**:

- The path/method wasn’t in the compiled list (e.g. RegExp route, or route that couldn’t be flattened).
- The path was never registered (e.g. app has only middleware and no string-path routes compiled).
- Literally any request Fastify doesn’t have a route for.

So:

- `GET /api/users` might be on the **Fastify lane** if we compiled that route.
- `GET /api/users/` (trailing slash) or `GET /some-regex-path` might hit **Express lane** if we didn’t register that exact path on Fastify.
- 404s are always handled by Express (via this same notFoundHandler → expressApp call), so your Express 404 middleware runs on the Express lane.

---

## RegExp and non-string routes (how Express handles them)

**Express** natively supports RegExp (and other non-string) paths: `app.get(/^\/user\/[0-9]+$/, fn)` and `app.use(/^\/api/, fn)` are valid. The Express router (the `router` package) stores and matches these; see e.g. Express 5 tests in `test/app.use.js` (“should support regexp path”) and `test/app.router.js` (“when given a regexp”). **Rendering is not tied to RegExp** — Express’s own EJS example (`express-5.2.1/examples/ejs/index.js`) uses a normal string path: `app.get('/', ...)` and `res.render('users', ...)`.

**We** do not flatten routes whose `route.path` is not a string (e.g. RegExp) onto the Fastify lane: in `flattenRouter` we skip those layers so they are never registered as Fastify routes. So:

- RegExp routes **always** run on the **Express lane**. The real Express app (and its router) run and match the path with the RegExp.
- We don’t try to convert RegExp to a Fastify path; Fastify’s route API is path-based, so we leave RegExp handling to Express.

In our **view-engine** and **fast-view** examples we use a RegExp path for the page that calls `res.render()` **only** so that route stays on the Express lane — our response adapter does not implement `res.render` on the Fastify lane. So we use `app.get(/^\/page\/?/, ...)` there as a deliberate choice: that way the request is not compiled to Fastify and goes to the Express lane where `res.render` exists. It is not because Express “uses RegExp for rendering”; it’s so that this app works with `fast()` without implementing `res.render` in the adapter.

---

## Summary

| Concept | What it is |
|--------|------------|
| **Express lane** | Running the **full Express app** as the Fastify **notFoundHandler**: we build adapted req/res and call `expressApp(req, res, next)`. |
| **Adapted req/res** | Objects that implement Express’s req/res API and delegate to the current Fastify request/reply so one response is sent and the router can mutate url/baseUrl/originalUrl. |
| **When it runs** | When no Fastify route matched (including 404). |
| **Where it’s code** | `src/express/mount.ts` (mountExpress), request adapter in `src/fastify/adapters/request.ts`, response adapter in `src/fastify/adapters/response.ts`. |

So the “Express lane” isn’t a separate server or process — it’s “the real Express app, run once per unhandled request, with adapted req/res, inside Fastify’s notFoundHandler.”
