# How we differ from @fastify/express

We looked at the official **@fastify/express** plugin (in the open-source repo under `fastify-express/`). Here’s what they do and how it compares to **express-fastify-runtime**.

---

## @fastify/express: no optimization of Express

**Approach:** Run the real Express app inside a Fastify hook. Every request goes through Express.

1. **Real Express app** — They create and keep a full Express application:
   ```js
   fastify.decorate('express', Express())
   fastify.use(path, fn)  // → this.express.use(path, fn)
   ```

2. **One hook, two steps** (e.g. `onRequest` or `preHandler` via `expressHook`):
   - **enhanceRequest:** Patch the **raw** Node `req`/`res` (Fastify’s `req.raw`, `reply.raw`) so Express can use them:
     - Set on `req.raw`: `url`, `originalUrl`, `id`, `hostname`, `ip`, `ips`, `log` (from Fastify req).
     - Copy `req.body` and `req.cookies` onto `req.raw` for body-parser/cookie-parser compatibility.
     - Lazy getter for `req.raw.protocol` (from Fastify `req.protocol`).
     - Patch `reply.raw.send` so it restores `req.raw.url` before sending (for Express middleware that mutate url).
     - Optional: wrap `req.raw` in a **Proxy** via `createProxyHandler` to expose Fastify request fields.
   - **runConnect:** If there are middlewares, copy reply headers to `reply.raw`, then call **`this.express(req.raw, reply.raw, next)`**. So the **entire Express app** (router + all middleware) runs with the raw Node request/response.

3. **No compile step** — They don’t introspect routes or register Fastify routes. Express’s router and middleware run for every request. So you get full Express compatibility but **no speed gain** from Fastify for those routes; you only get Fastify’s server and lifecycle around Express.

4. **README note:** They explicitly say: *“This plugin should not be used as a long-term solution, it aims to help you have a smooth transition from Express to Fastify, but you should migrate your Express specific code to Fastify over time.”*

**Summary:** @fastify/express does **not** optimize Express. It runs Express as-is and only “plumbs” Fastify’s request into Express by enhancing `req.raw` / `reply.raw`. Every request pays the full Express cost.

---

## express-fastify-runtime: we optimize by compiling

**Approach:** At startup we **compile** the Express app into Fastify routes; only unmatched requests fall back to Express.

1. **Introspect + flatten** — We patch Express’s router `Layer` and flatten the app’s stack so we know every middleware path and route (method + path + handlers).

2. **Register real Fastify routes** — For each Express route we register a Fastify route (same method and path). So `GET /foo` is a real Fastify route; the request **never** hits Express’s router for that path.

3. **Adapter layer** — For those compiled routes we don’t run the Express app. We:
   - Build Express-like `req`/`res` (reusable adapters) once per request in a preHandler.
   - Run only the **applicable** middleware (path-matched) and the **route handler** ourselves (same `next()` semantics).
   - So we pay: adapter + N middleware calls + handler. We do **not** run Express’s router or the rest of the Express stack.

4. **Express lane (proxy)** — If no Fastify route matches (e.g. RegExp route, or 404), we proxy to the **real** Express app with `req.raw`/`reply.raw` (and body from Fastify), same idea as @fastify/express but only for the fallback path.

So we have **two paths**: a **Fastify lane** (compiled, our adapter + user handlers) and an **Express lane** (full Express app). @fastify/express has only the latter.

---

## Side-by-side

| Aspect | @fastify/express | express-fastify-runtime |
|--------|------------------|--------------------------|
| **Runs Express app** | Yes, for every request | Only when no Fastify route matches (Express lane) |
| **Compiles routes to Fastify** | No | Yes (string paths only) |
| **Request/response** | Use raw Node req/res, enhanced with a few props | Express-like req/res adapters (reusable) on Fastify lane; raw on Express lane |
| **Body parsing** | Express or @fastify/formbody before Express | Fastify’s parser; we put body on req for Express lane and skip express.json() on Fastify lane |
| **Performance** | Same as Express (no gain from Fastify for Express routes) | Fastify lane: close to Fastify; Express lane: same as Express (we optimized the proxy) |
| **Goal** | Transition aid; migrate off Express over time | Run existing Express apps faster with minimal changes; optional expressLane() for non-compiled routes |

---

## Takeaways

- **@fastify/express** does **not** add any optimizations to Express. It’s “run Express inside Fastify” with minimal plumbing (enhance req.raw, then call `express(req.raw, reply.raw, next)`). Good for compatibility and gradual migration; not for making Express faster.
- **We** optimize by compiling Express routes to Fastify and running only our adapter + the user’s middleware/handlers on the Fastify lane, so we get close to Fastify speed for those routes. The only “run full Express” path is the fallback (Express lane), which we’ve tuned to be at least as fast as raw Express.

So the two projects solve different problems: **@fastify/express** = compatibility + migration path; **express-fastify-runtime** = keep your Express app and run it faster by compiling to Fastify where possible.
