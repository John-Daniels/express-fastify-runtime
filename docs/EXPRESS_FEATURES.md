# Express features: supported vs not yet

This list is derived from the **Express 5.2.1** codebase (`express-5.2.1/lib/`). We mark what express-fastify-runtime supports today and what is not yet implemented. See [EXPRESS_REFERENCE.md](./EXPRESS_REFERENCE.md) for how we use Express as reference and which pitfalls we avoid.

---

## Application (app)

| Feature | Express | express-fastify-runtime |
|--------|---------|--------------------------|
| **app.use(fn)** | ✅ | ✅ Supported |
| **app.use(path, fn)** | ✅ | ✅ Supported |
| **app.METHOD(path, ...handlers)** (get, post, put, patch, delete, head, options) | ✅ | ✅ Supported |
| **app.all(path, ...handlers)** | ✅ | ✅ Supported |
| **app.listen(port, callback?)** | ✅ returns `http.Server` | ✅ Supported — returns `Promise<ServerLike>` (async) |
| **app.listen(port, host, callback?)** | ✅ | ✅ Supported |
| **app.listen(callback?)** | ✅ | ✅ Supported |
| **createApp(options?)** | N/A | ✅ `options.dev` enables fallback warnings when downgrading to Express lane |
| **app.route(path)** | ✅ returns Router#route() | ❌ Not yet (v1: fail loudly if used) |
| **app.engine(ext, fn)** | ✅ | ❌ Not yet |
| **app.param(name, fn)** | ✅ | ❌ Not yet |
| **app.set(setting, val)** | ✅ | ❌ Not yet |
| **app.get(setting)** | ✅ (settings) | ❌ Not yet |
| **app.path()** | ✅ | ❌ Not yet |
| **app.enabled(setting)** | ✅ | ❌ Not yet |
| **app.disabled(setting)** | ✅ | ❌ Not yet |
| **app.enable(setting)** | ✅ | ❌ Not yet |
| **app.disable(setting)** | ✅ | ❌ Not yet |
| **app.render(name, options?, callback?)** | ✅ | ❌ Not yet |
| **app.handle(req, res, callback)** | ✅ (internal) | N/A (internal) |
| **app.init()** | ✅ (internal) | N/A (internal) |
| **app.defaultConfiguration()** | ✅ (internal) | N/A (internal) |

---

## Request (req)

| Feature | Express | express-fastify-runtime |
|--------|---------|--------------------------|
| **req.get(name)** / **req.header(name)** | ✅ | ✅ Supported (Referer/Referrer interchangeable) |
| **req.query** | ✅ | ✅ Supported |
| **req.params** | ✅ | ✅ Supported |
| **req.body** | ✅ | ✅ Supported (when body parsed) |
| **req.method** | ✅ | ✅ Supported |
| **req.url** | ✅ | ✅ Supported (writable for router) |
| **req.headers** | ✅ | ✅ Supported |
| **req.originalUrl** | ✅ | ✅ Supported (writable for router) |
| **req.baseUrl** | ✅ | ✅ Supported (writable for router) |
| **req.path** | ✅ | ✅ Supported (derived from url) |
| **req.protocol** | ✅ | ✅ Supported (x-forwarded-proto or socket) |
| **req.secure** | ✅ | ✅ Supported |
| **req.ip** | ✅ | ✅ Supported (x-forwarded-for or remoteAddress) |
| **req.ips** | ✅ | ✅ Supported (x-forwarded-for array) |
| **req.hostname** | ✅ | ✅ Supported (from Host header) |
| **req.host** | ✅ | ✅ Supported |
| **req.xhr** | ✅ | ✅ Supported (X-Requested-With header) |
| **req.fresh** | ✅ | ✅ Supported (stub: false) |
| **req.stale** | ✅ | ✅ Supported (stub: true) |
| **req.cookies** | ✅ | ✅ Supported (parsed from Cookie header) |
| **req.signedCookies** | ✅ | ✅ Supported (stub: {}; use cookie-parser for signed) |
| **req.accepts(...)** | ✅ | ❌ Not yet |
| **req.acceptsCharsets(...)** | ✅ | ❌ Not yet |
| **req.acceptsEncodings(...)** | ✅ | ❌ Not yet |
| **req.acceptsLanguages(...)** | ✅ | ❌ Not yet |
| **req.range(size, options?)** | ✅ | ❌ Not yet |
| **req.is(types)** | ✅ | ❌ Not yet |
| **req.subdomains** | ✅ | ❌ Not yet |
| **req.app** | ✅ | ❌ Not yet |
| **req.res** | ✅ | ❌ Not yet |
| **req.next** | ✅ | ❌ Not yet |
| **req.route** | ✅ | ❌ Not yet |

---

## Response (res)

| Feature | Express | express-fastify-runtime |
|--------|---------|--------------------------|
| **res.status(code)** | ✅ | ✅ Supported |
| **res.send(body?)** | ✅ | ✅ Supported |
| **res.json(body?)** | ✅ | ✅ Supported |
| **res.set(field, value?)** / **res.header(field, value?)** | ✅ | ✅ Supported |
| **res.setHeader(name, value)** | ✅ | ✅ Supported |
| **res.sendStatus(code)** | ✅ | ✅ Supported |
| **res.type(type)** / **res.contentType(type)** | ✅ | ✅ Supported |
| **res.links(links)** | ✅ | ✅ Supported |
| **res.jsonp(body?)** | ✅ | ✅ Supported |
| **res.attachment(filename?)** | ✅ | ✅ Supported |
| **res.append(field, val)** | ✅ | ✅ Supported |
| **res.get(field)** | ✅ | ✅ Supported |
| **res.cookie(name, val, options?)** | ✅ | ✅ Supported |
| **res.clearCookie(name, options?)** | ✅ | ✅ Supported |
| **res.location(url)** | ✅ | ✅ Supported (url `"back"` → Referrer or `/`; encodeurl) |
| **res.redirect(url)** / **res.redirect(status, url)** | ✅ | ✅ Supported |
| **res.vary(field)** | ✅ | ✅ Supported |
| **res.locals** | ✅ | ✅ Supported (per-request object) |
| **res.headersSent** | ✅ | ✅ Supported |
| **res.end(cb?)** / **res.end(chunk, encoding?, cb?)** | ✅ | ✅ Supported |
| **res.sendFile(path, options?, callback?)** | ✅ | ❌ Not yet |
| **res.download(path, filename?, options?, callback?)** | ✅ | ❌ Not yet |
| **res.format(obj)** | ✅ | ❌ Not yet |
| **res.render(view, options?, callback?)** | ✅ | ❌ Not yet |
| **res.app** | ✅ | ❌ Not yet |
| **res.req** | ✅ | ❌ Not yet |
| **res.charset** | ✅ | ❌ Not yet |

---

## express.* exports (middleware / static)

| Feature | Express | express-fastify-runtime |
|--------|---------|--------------------------|
| **express.json()** | ✅ | ✅ Intercepted → Fastify JSON parser (same behavior) |
| **express.raw()** | ✅ | ❌ Not yet |
| **express.text()** | ✅ | ❌ Not yet |
| **express.urlencoded()** | ✅ | ❌ Not yet |
| **express.static(root, options?)** | ✅ | ❌ Not yet |
| **express.Router()** | ✅ | ✅ Supported — `app.use(path?, router)` flattens the router (routes and `router.use(path, fn)` middleware) into the route store when the router package's Layer is patched (load express-fastify-runtime before creating routers). Safe routes and middleware get Fastify speeds. Nested routers are flattened recursively. RegExp paths fall back to Express lane. |
| **express.Route** | ✅ | ❌ Not yet (used internally by Router) |
| **express.application** | ✅ (proto) | N/A |
| **express.request** | ✅ (proto) | N/A |
| **express.response** | ✅ (proto) | N/A |

---

## listen() and server

| Aspect | Express | express-fastify-runtime |
|--------|---------|--------------------------|
| **Return type** | `http.Server` (synchronous) | `Promise<ServerLike>` (async) |
| **server.close(callback?)** | ✅ | ✅ Supported via `ServerLike#close(callback?)` |
| **server.address()** | ✅ | ✅ Supported via `ServerLike#address()` |
| **http.createServer(app).listen(...)** | ✅ (app is request listener) | ❌ Not supported; use `app.listen()` |

Express returns the Node `http.Server` from `listen()`. We return a **Promise** that resolves to a **ServerLike** object with `close()` and `address()` so you can shut down and inspect the server the same way. We do not expose the raw Node server for `http.createServer(app)`; use `app.listen()` instead.

---

## Fallback behavior (dev warnings)

When a feature is not fully supported but can run on the **Express lane**, we fall back to the real Express app and log a warning in development so you know to open an issue if you need full support.

- **When:** `createApp({ dev: true })` or `NODE_ENV !== 'production'`.
- **Message:** `[express-fastify-runtime] <Feature> is not supported fully yet, downgrading to express pattern (create an issue if this is something you would like express-runtime to support)`.
- **Example:** `express.Router()` with middleware or RegExp path cannot be flattened → router is mounted as one middleware on Express lane; in dev the warning is logged. No pino dependency; uses `console.warn`.

---

## Summary

- **Supported:** `app.use`, `app.METHOD`, `app.all`, `app.listen` (with overloads), `express.Router()` (flattened when possible; else Express lane + dev warn), `req.get`/`header` (Referer/Referrer interchangeable), `req.query`/`params`/`body`/`method`/`url`/`headers`/`path`/`protocol`/`secure`/`ip`/`ips`/`hostname`/`host`/`xhr`/`fresh`/`stale`/`cookies`/`signedCookies`/`originalUrl`/`baseUrl`, `req.accepts`/`req.acceptsCharsets`/`req.acceptsEncodings`/`req.acceptsLanguages`/`req.range`/`req.is`, `res.status`/`send`/`json`/`set`/`setHeader`/`header`/`sendStatus`/`type`/`contentType`/`links`/`jsonp`/`attachment`/`append`/`get`/`cookie`/`clearCookie`/`location` (including `"back"`)/`redirect`/`vary`/`locals`/`headersSent`/`end`, `next()`, async handlers, `express.json()` (mapped to Fastify), route locking after `listen()`, `ServerLike` with `close()` and `address()`.
- **Not yet:** Route (internal), app settings (set/get/enable/disable), views (engine/render), param middleware, `res.sendFile`/`res.download`/`res.format`/`res.render`, `req.subdomains`/`req.app`/`req.res`/`req.next`/`req.route`, static (express.static). Unsupported features fall back to Express lane with a dev warning where applicable.
