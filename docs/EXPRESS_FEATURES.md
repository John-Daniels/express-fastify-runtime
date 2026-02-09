# Express features: supported vs not yet

This list is derived from the **Express 5.2.1** codebase (`express-5.2.1/lib/`). We mark what express-fastify-runtime supports today and what is not yet implemented. See [EXPRESS_REFERENCE.md](./EXPRESS_REFERENCE.md) for how we use Express as reference and which pitfalls we avoid.

**fast() column:** Compatibility when using `fast(expressApp)`. ✅ = works on both Fastify lane and Express lane. **Express lane** = works only when the request is handled by the Express lane (fallback); not implemented on the Fastify lane.

---

## Application (app)

| Feature | Express | express-fastify-runtime | fast() |
|--------|---------|--------------------------|--------|
| **app.use(fn)** | ✅ | ✅ Supported | ✅ |
| **app.use(path, fn)** | ✅ | ✅ Supported | ✅ |
| **app.METHOD(path, ...handlers)** (get, post, put, patch, delete, head, options) | ✅ | ✅ Supported | ✅ |
| **app.all(path, ...handlers)** | ✅ | ✅ Supported | ✅ |
| **app.listen(port, callback?)** | ✅ returns `http.Server` | ✅ Supported — returns `Promise<ServerLike>` (async) | N/A — fast() returns Fastify; use `fastApp.server.listen()` or `fastApp.listen()` |
| **app.listen(port, host, callback?)** | ✅ | ✅ Supported | N/A |
| **app.listen(callback?)** | ✅ | ✅ Supported | N/A |
| **createApp(options?)** | N/A | ✅ `options.dev` enables fallback warnings when downgrading to Express lane | N/A — createApp only |
| **app.route(path)** | ✅ returns Router#route() | ❌ Not yet (v1: fail loudly if used) | ❌ Not yet |
| **app.engine(ext, fn)** | ✅ | ❌ Not yet | Express lane only |
| **app.param(name, fn)** | ✅ | ❌ Not yet | Express lane only |
| **app.set(setting, val)** | ✅ | ❌ Not yet | ❌ Not yet |
| **app.get(setting)** | ✅ (settings) | ❌ Not yet | ❌ Not yet |
| **app.path()** | ✅ | ❌ Not yet | ❌ Not yet |
| **app.enabled(setting)** | ✅ | ❌ Not yet | ❌ Not yet |
| **app.disabled(setting)** | ✅ | ❌ Not yet | ❌ Not yet |
| **app.enable(setting)** | ✅ | ❌ Not yet | ❌ Not yet |
| **app.disable(setting)** | ✅ | ❌ Not yet | ❌ Not yet |
| **app.render(name, options?, callback?)** | ✅ | ❌ Not yet | Express lane only |
| **app.handle(req, res, callback)** | ✅ (internal) | N/A (internal) | N/A |
| **app.init()** | ✅ (internal) | N/A (internal) | N/A |
| **app.defaultConfiguration()** | ✅ (internal) | N/A (internal) | N/A |

---

## Request (req)

| Feature | Express | express-fastify-runtime | fast() |
|--------|---------|--------------------------|--------|
| **req.get(name)** / **req.header(name)** | ✅ | ✅ Supported (Referer/Referrer interchangeable) | ✅ |
| **req.query** | ✅ | ✅ Supported | ✅ |
| **req.params** | ✅ | ✅ Supported | ✅ |
| **req.body** | ✅ | ✅ Supported (when body parsed) | ✅ |
| **req.method** | ✅ | ✅ Supported | ✅ |
| **req.url** | ✅ | ✅ Supported (writable for router) | ✅ |
| **req.headers** | ✅ | ✅ Supported | ✅ |
| **req.originalUrl** | ✅ | ✅ Supported (writable for router) | ✅ |
| **req.baseUrl** | ✅ | ✅ Supported (writable for router) | ✅ |
| **req.path** | ✅ | ✅ Supported (derived from url) | ✅ |
| **req.protocol** | ✅ | ✅ Supported (x-forwarded-proto or socket) | ✅ |
| **req.secure** | ✅ | ✅ Supported | ✅ |
| **req.ip** | ✅ | ✅ Supported (x-forwarded-for or remoteAddress) | ✅ |
| **req.ips** | ✅ | ✅ Supported (x-forwarded-for array) | ✅ |
| **req.hostname** | ✅ | ✅ Supported (from Host header) | ✅ |
| **req.host** | ✅ | ✅ Supported | ✅ |
| **req.xhr** | ✅ | ✅ Supported (X-Requested-With header) | ✅ |
| **req.fresh** | ✅ | ✅ Supported (stub: false) | ✅ |
| **req.stale** | ✅ | ✅ Supported (stub: true) | ✅ |
| **req.cookies** | ✅ | ✅ Supported (parsed from Cookie header) | ✅ |
| **req.signedCookies** | ✅ | ✅ Supported (stub: {}; use cookie-parser for signed) | ✅ |
| **req.accepts(...)** | ✅ | ✅ Supported (accepts package) | ✅ |
| **req.acceptsCharsets(...)** | ✅ | ✅ Supported | ✅ |
| **req.acceptsEncodings(...)** | ✅ | ✅ Supported | ✅ |
| **req.acceptsLanguages(...)** | ✅ | ✅ Supported | ✅ |
| **req.range(size, options?)** | ✅ | ✅ Supported (range-parser; options.combine) | ✅ |
| **req.is(types)** | ✅ | ✅ Supported (type-is package) | ✅ |
| **req.subdomains** | ✅ | ❌ Not yet | ❌ Not yet |
| **req.app** | ✅ | ❌ Not yet | ❌ Not yet |
| **req.res** | ✅ | ❌ Not yet | ❌ Not yet |
| **req.next** | ✅ | ❌ Not yet | ❌ Not yet |
| **req.route** | ✅ | ❌ Not yet | ❌ Not yet |

---

## Response (res)

| Feature | Express | express-fastify-runtime | fast() |
|--------|---------|--------------------------|--------|
| **res.status(code)** | ✅ | ✅ Supported | ✅ |
| **res.send(body?)** | ✅ | ✅ Supported | ✅ |
| **res.json(body?)** | ✅ | ✅ Supported | ✅ |
| **res.set(field, value?)** / **res.header(field, value?)** | ✅ | ✅ Supported | ✅ |
| **res.setHeader(name, value)** | ✅ | ✅ Supported | ✅ |
| **res.sendStatus(code)** | ✅ | ✅ Supported | ✅ |
| **res.type(type)** / **res.contentType(type)** | ✅ | ✅ Supported | ✅ |
| **res.links(links)** | ✅ | ✅ Supported | ✅ |
| **res.jsonp(body?)** | ✅ | ✅ Supported | ✅ |
| **res.attachment(filename?)** | ✅ | ✅ Supported | ✅ |
| **res.append(field, val)** | ✅ | ✅ Supported | ✅ |
| **res.get(field)** | ✅ | ✅ Supported | ✅ |
| **res.cookie(name, val, options?)** | ✅ | ✅ Supported | ✅ |
| **res.clearCookie(name, options?)** | ✅ | ✅ Supported | ✅ |
| **res.location(url)** | ✅ | ✅ Supported (url `"back"` → Referrer or `/`; encodeurl) | ✅ |
| **res.redirect(url)** / **res.redirect(status, url)** | ✅ | ✅ Supported | ✅ |
| **res.vary(field)** | ✅ | ✅ Supported | ✅ |
| **res.locals** | ✅ | ✅ Supported (per-request object) | ✅ |
| **res.headersSent** | ✅ | ✅ Supported | ✅ |
| **res.end(cb?)** / **res.end(chunk, encoding?, cb?)** | ✅ | ✅ Supported | ✅ |
| **res.sendFile(path, options?, callback?)** | ✅ | ❌ Not yet | Express lane only |
| **res.download(path, filename?, options?, callback?)** | ✅ | ❌ Not yet | Express lane only |
| **res.format(obj)** | ✅ | ❌ Not yet | Express lane only |
| **res.render(view, options?, callback?)** | ✅ | ❌ Not yet | Express lane only |
| **res.app** | ✅ | ❌ Not yet | ❌ Not yet |
| **res.req** | ✅ | ❌ Not yet | ❌ Not yet |
| **res.charset** | ✅ | ❌ Not yet | ❌ Not yet |

---

## express.* exports (middleware / static)

| Feature | Express | express-fastify-runtime | fast() |
|--------|---------|--------------------------|--------|
| **express.json()** | ✅ | ✅ Intercepted → Fastify JSON parser (same behavior) | ✅ |
| **express.raw()** | ✅ | ❌ Not yet | Express lane only |
| **express.text()** | ✅ | ❌ Not yet | Express lane only |
| **express.urlencoded()** | ✅ | ❌ Not yet | Express lane only |
| **express.static(root, options?)** | ✅ | ❌ Not yet | Express lane only |
| **express.Router()** | ✅ | ✅ Supported — flatten when Layer patched; RegExp → Express lane | ✅ (flattened routes on Fastify lane; else Express lane) |
| **express.Route** | ✅ | ❌ Not yet (used internally by Router) | ❌ Not yet |
| **express.application** | ✅ (proto) | N/A | N/A |
| **express.request** | ✅ (proto) | N/A | N/A |
| **express.response** | ✅ (proto) | N/A | N/A |

---

## listen() and server

| Aspect | Express | express-fastify-runtime | fast() |
|--------|---------|--------------------------|--------|
| **Return type** | `http.Server` (synchronous) | `Promise<ServerLike>` (async) | Fastify instance; `fastApp.server` is Node `http.Server` |
| **server.close(callback?)** | ✅ | ✅ Supported via `ServerLike#close(callback?)` | ✅ `fastApp.server.close()` or Fastify lifecycle |
| **server.address()** | ✅ | ✅ Supported via `ServerLike#address()` | ✅ `fastApp.server.address()` after listen |
| **http.createServer(app).listen(...)** | ✅ (app is request listener) | ❌ Not supported; use `app.listen()` | N/A — use `fast(app)` then `fastApp.server.listen()` or `fastApp.listen()` |

Express returns the Node `http.Server` from `listen()`. **createApp()** returns a **Promise\<ServerLike\>** from `listen()`. **fast()** returns a Fastify instance; use `fastApp.server.listen(port, cb)` or `fastApp.listen({ port })` to start. We do not support `http.createServer(app)`; use `app.listen()` or fast().

**Binding host:** To accept connections from other hosts (e.g. in Docker or from another machine), bind to `0.0.0.0`, as with Fastify: `server.listen({ port, host: '0.0.0.0' }, cb)`. If the server is unreachable, ensure you are not listening only on the default (localhost).

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

### fast() — compatible features

With **fast(expressApp)** the following work on both the **Fastify lane** (compiled routes) and the **Express lane** (fallback):

- **App:** `app.use`, `app.use(path, fn)`, `app.METHOD`, `app.all`. (No `app.listen` — fast() returns Fastify; use `fastApp.server.listen()` or `fastApp.listen()`.)
- **req:** All supported request APIs in the table above: `get`/`header`, `query`/`params`/`body`/`method`/`url`/`headers`/`path`/`protocol`/`secure`/`ip`/`ips`/`hostname`/`host`/`xhr`/`fresh`/`stale`/`cookies`/`signedCookies`, `accepts`/`acceptsCharsets`/`acceptsEncodings`/`acceptsLanguages`/`range`/`is`.
- **res:** All supported response APIs: `status`/`send`/`json`/`set`/`setHeader`/`header`/`sendStatus`/`type`/`contentType`/`links`/`jsonp`/`attachment`/`append`/`get`/`cookie`/`clearCookie`/`location`/`redirect`/`vary`/`locals`/`headersSent`/`end`.
- **Middleware:** `express.json()` (intercepted → Fastify), `express.Router()` (flattened when Layer is patched; RegExp paths use Express lane).

**Express lane only** (work when the request is handled by the Express fallback; not implemented on the Fastify lane): `res.sendFile`, `res.download`, `res.format`, `res.render`, `app.engine`, `app.param`, `app.render`, `express.raw()`/`text()`/`urlencoded()`/`static()`. Use these on routes that hit the Express lane (e.g. RegExp routes or routes we don’t flatten), or avoid them on Fastify-lane routes.
