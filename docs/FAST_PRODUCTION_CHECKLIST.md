# fast(app) — Production checklist: what works, what fails, what’s missing

Use this list to decide if your Express app is safe to run with `fast(app)` in production. **If your app uses something in “Will fail” or “Missing (will break at runtime)”, either avoid it or keep that path on the Express lane (e.g. don’t rely on it being compiled to the Fastify lane).**

---

## Keeping a route on the Express lane

When a handler needs Express-only APIs (e.g. **res.render**, **res.sendFile**), you can force that route to run on the Express lane in two ways:

1. **Non-decorator:** wrap the handler with **expressLane(fn)**. The route is not compiled to Fastify and always runs on the Express lane.
   ```js
   const { fast, expressLane } = require('express-fastify-runtime');
   app.get('/page', expressLane((req, res) => res.render('index', { title: 'Hello' })));
   ```
2. **Decorator (TypeScript):** use **@ExpressLane()** on a class method. Requires `"experimentalDecorators": true` in tsconfig.
   ```ts
   import { ExpressLane } from 'express-fastify-runtime';
   class PageController {
     @ExpressLane()
     page(req: Request, res: Response) {
       res.render('index', { title: 'Hello' });
     }
   }
   app.get('/page', (req, res, next) => new PageController().page(req, res, next));
   ```

3. **Whole router (e.g. Swagger / docs that use res.render):** wrap the router with **expressLane(router)** so that path is not compiled to Fastify and stays on the Express lane.
   ```js
   app.use('/docs', expressLane(docs));  // all /docs/* handled by Express
   ```

You can also use a **RegExp path** (e.g. `app.get(/^\/page/, fn)`) — RegExp routes are not flattened, so they run on the Express lane. Prefer **expressLane(fn)** for a normal string path when you want the route to stay on Express.

---

## Why is everything on the Express lane?

If **every** request (including `GET /` and JSON APIs like `POST /v1/admins/auth/login`) goes to the Express lane, it usually means **no routes were compiled to the Fastify lane**. That happens when the runtime cannot flatten the app’s router stack.

**Main cause: load order**

- **You must load express-fastify-runtime before creating the Express app or any router.**  
  The runtime patches Express’s router `Layer` so it can see middleware paths. If the app is created first, those `Layer` instances never get the path metadata, so flattening fails and we compile zero Fastify routes → every request hits the notFoundHandler (Express lane).

**Correct:** load the runtime first, then create the app:

```js
import 'express-fastify-runtime';  // or: require('express-fastify-runtime');
import express from 'express';
const app = express();
app.get('/', (req, res) => res.send('Hello'));
// ...
```

**Wrong:** create the app in one file and call `fast(app)` from another without ever importing the runtime before the app is created:

```js
// app.ts
import express from 'express';
const app = express();
// ... no express-fastify-runtime import here ...
export default app;

// server.ts
import app from './app';
import { fast } from 'express-fastify-runtime';
fast(app);  // app was already built without the patch → no Fastify routes
```

**Other causes**

- A middleware layer is mounted with a **RegExp or array path** (e.g. `app.use(/^\/api/, fn)`). We need a string path for each layer; if we can’t read one, we abort flattening and compile no Fastify routes.
- The app uses a **different copy** of the `router` package than the one we patch (e.g. nested workspaces). The patch runs from the runtime package, `process.cwd()`, and the **main script’s directory** (so e.g. `node examples/my-app/index.js` patches the `router` that `require('express')` resolves from that app). The same `router` the app uses must be patched.

**Check**

- Use **`experimental: { diagnostics: true }`** in `fast(app, { experimental: { diagnostics: true } })`. If you see “No routes compiled to Fastify lane” at startup, flattening failed. If you see “Express lane” for every request and never “Fastify lane”, same thing.
- Fix load order so the first line of your app entry (or the file that creates the Express app) is `import 'express-fastify-runtime'` (or `require('express-fastify-runtime')`), then create the app and add routes.

---

## Will fail or break at runtime

These will throw, return wrong behavior, or 500 if you use them in routes/middleware that run on the Fastify lane or through the adapted req/res.

| Feature | Why it fails | Workaround |
|--------|---------------|------------|
| **res.sendFile()** / **res.download()** | Not implemented | Use Express lane for that route, or serve files with Fastify (e.g. `@fastify/static`) and keep the rest on fast(app). |
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
| **Double res.send() / res.json()** | Second send triggers "Cannot set headers after they are sent" (Express lane) or Fastify "already sent" (Fastify lane). | Ensure each request path sends at most once. In **global error handlers**, guard with `if (!res.headersSent) res.status(500).json({ error: ... })` so you do not send after the response was already sent. |
| **Streaming (res.write / pipe(res))** | Fastify lane uses reply.send(); streaming is not mapped 1:1 | Use Express lane for streaming responses, or implement with Fastify streams. |
| **404** | Unhandled requests go to Express via setNotFoundHandler (same app, adapted req/res). Catch-all `app.use((req, res) => …)` is only run when no route matched (we run middleware in stack order before the matching route). | 404 behavior is correct; ensure your app’s 404 handler doesn’t rely on unsupported res/req APIs. |
| **req.originalUrl / req.baseUrl / req.url** | Set and **writable** in the notFoundHandler adapter so Express router can mutate them. In Fastify lane they come from the request adapter used there. | Use as normal for routing; avoid mutating them in application code if you rely on them later. |

---

## Supported and safe for production (with caveats)

- **app.use(fn)**, **app.use(path, fn)**, **app.METHOD(path, ...handlers)**, **app.all(path, ...handlers)**
- **express.Router()** with string paths and middleware (load express-fastify-runtime before creating the app so Layer is patched)
- **express.json()** — intercepted to Fastify’s JSON parser
- **req:** get/header, query, params, body, method, url, headers, originalUrl, baseUrl, **path**, **protocol**, **secure**, **ip**, **ips**, **hostname**, **host**, **xhr**, **fresh**, **stale**, **cookies** (Cookie header parsed), **signedCookies** (stub)
- **res:** status, send, json, set, setHeader, header, **sendStatus**, **type**, **contentType**, **links**, **jsonp**, **attachment**, **append**, **get**, **cookie**, **clearCookie**, **location**, **redirect**, **vary**, **locals** (per-request object), **headersSent**, **end**
- **listen()** — use `fastApp.listen({ port }, cb)` or `fastApp.server.listen(port, cb)` (wrapper delegates to Fastify). **Bind to `0.0.0.0`** (e.g. `server.listen({ port, host: '0.0.0.0' }, cb)`) so the server accepts connections from other hosts; otherwise it may only listen on localhost and be unreachable from containers or the network (same as Fastify).
- **WebSockets / Socket.IO** — attach to `fastApp.server` after creating the app
- **Single 4-arg error middleware** — wired for both Express lane and Fastify lane (with the Fastify-lane caveat in EDGE_CASES)
- **Early return (no next())** — chain stops as in Express

---

## Before you ship

1. **Audit your app** for everything in the “Will fail” table; avoid or keep those paths on Express lane.
2. **Use one global 4-arg error handler** and ensure it only uses supported res APIs (all common res.* methods are now supported).
3. **Load express-fastify-runtime before Express** (and before creating routers) so router Layer is patched and flattening works.
4. **Test** 404, errors (throw and next(err)), and any middleware that uses sendFile/static/render.
5. **Run your test suite** against `fast(app)`; add a smoke test that hits the main routes and error path.

For full feature tables see **EXPRESS_FEATURES.md** and **EDGE_CASES.md**.
