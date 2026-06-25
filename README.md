# express-fastify-runtime

> Your Express app. Fastify's speed. One line. No rewrite.

```ts
import { fast } from "express-fastify-runtime";
import express from "express";

const app = express();
app.get("/", (req, res) => res.json({ hello: "world" }));

fast(app).listen({ port: 3000 });   // 👈 that's the whole trick
```

---

## A short, slightly emotional story

I love Express. I love it the way you love a comfortable pair of shoes — `req`, `res`,
`next`, a thousand middlewares on npm, and muscle memory built over years. Express is *home*.

Then one day someone showed me a Fastify benchmark and my coffee went cold. "Two-ish times the
throughput," they said, smiling like they'd discovered fire. And I thought: do I really have to
abandon my comfortable shoes and rewrite everything in a new framework just to go faster?

So I went looking for a shortcut. I found tools that "run Express on Fastify" — and many of them
do *exactly* one thing: they hand your Express app to Fastify and let Fastify… call Express for
every request. Your app technically runs "on Fastify." It is not one bit faster. It's a very
polite handshake between two frameworks where nothing actually changes. Cool sticker, no engine.

**`express-fastify-runtime` is the engine.** It doesn't just *expose* your Express app to
Fastify — it **compiles** your safe routes and middleware onto Fastify's real request pipeline,
and only falls back to actual Express for the things that genuinely need it (multipart uploads,
`res.render`, streaming bodies, anything unusual). You keep writing Express. It actually gets
fast.

You don't rewrite a thing. You wrap one line. Your shoes stay on.

---

## What you get

- **It's still Express.** `app.use`, `app.get`, `req`, `res`, `next`, your middleware, your
  routers, your error handlers. Nothing to relearn. **Express 4 and 5 both welcome.**
- **It's actually fast.** Safe routes run compiled on Fastify — faster than plain Express across
  the board, and matching or beating Fastify on middleware-heavy and small-payload workloads
  (see [Benchmarks](#benchmarks)).
- **Nothing breaks.** Anything that can't safely run on Fastify is transparently handled by a
  real embedded `express()` instance. No silent behavior changes; morgan logs, helmet headers,
  auth, cookies, JSON parsing, streaming/SSE, and error middleware all behave like Express.
- **It's a real Fastify instance.** `fast(app)` returns a `FastifyInstance`, so Fastify fans get
  their plugins, hooks, and the raw Node server for WebSockets/Socket.IO.

---

## Install

```bash
npm install express-fastify-runtime
```

`express` is a **peer dependency** — bring your own (`^4.18` or `^5`). `fast()` uses whatever
Express you already have.

> **One rule:** import `express-fastify-runtime` **before** you create your Express app or any
> `express.Router()`. It patches the router layer at load time so middleware mounted with a path
> (`app.use('/api', mw)`, `router.use('/x', mw)`) can be compiled onto the Fastify lane. Import it
> late and those bits still work — they just fall back to the (slower) Express lane.

---

## For Express fans — wrap what you already have

You wrote a normal Express app. Wrap it. Done.

```ts
import "express-fastify-runtime";        // load first (the one rule)
import express from "express";
import morgan from "morgan";
import helmet from "helmet";
import { fast } from "express-fastify-runtime";

const app = express();
app.use(morgan("tiny"));                 // logs, correctly, per request
app.use(helmet());                       // security headers, intact
app.use(express.json());                 // parsed by Fastify's fast parser under the hood

app.get("/users/:id", (req, res) => {
  res.json({ id: req.params.id });
});

app.use((err, req, res, next) => {       // your error middleware still works
  res.status(500).json({ error: err.message });
});

const fastApp = fast(app);               // returns a Fastify instance
fastApp.listen({ port: 3000 });
```

Routers, controllers, `req.body`, `req.query`, `req.params`, `res.status().json()`,
`res.redirect()`, `res.cookie()`, async handlers, `next(err)` — all the Express you already
write. No changes.

## For Fastify fans — it's a real Fastify instance

`fast(app)` hands you back a genuine `FastifyInstance`. Add plugins, register hooks, use the
Fastify ecosystem — your Express routes just ride along on the Fastify lane.

```ts
import "express-fastify-runtime";
import express from "express";
import rateLimit from "@fastify/rate-limit";
import { fast } from "express-fastify-runtime";

const app = express();
app.get("/", (req, res) => res.json({ ok: true }));

const fastApp = fast(app, { fastify: { logger: true } });   // pass Fastify options through
await fastApp.register(rateLimit, { max: 100 });            // real Fastify plugins
await fastApp.ready();                                       // let plugins load before listen
await fastApp.listen({ port: 3000 });
```

## Plain Node `http`

`fastApp.server` is the real Node HTTP server, and `server.listen(...)` is wired to run
Fastify's full lifecycle (so 404s and internals work):

```ts
const fastApp = fast(app);
const server = fastApp.server;            // http.Server
server.listen(3000, () => console.log("up on 3000"));
```

## Socket.IO / WebSockets

Because you can reach the underlying HTTP server, real-time works exactly like it does in any
Node app — attach your socket server to `fastApp.server`:

```ts
import { Server as IOServer } from "socket.io";

const fastApp = fast(app);
const io = new IOServer(fastApp.server);  // share the same HTTP server
io.on("connection", (socket) => socket.emit("hello", "from express-fastify-runtime"));

fastApp.server.listen(3000);
```

The same pattern works for `ws`, `@fastify/websocket`, or anything that takes an
`http.Server`.

## Controlling which lane a route runs on

Every request runs on one of two lanes ([how it works](#how-it-works-30-seconds)):

- **Fastify lane (default, fast)** — safe routes and middleware are compiled onto Fastify
  automatically. You don't annotate anything for the common case.
- **Express lane (real Express)** — anything unsafe (multipart/uploads, `res.render`, `res.sendFile`,
  stream-piping middleware) is detected and transparently handled by the embedded real Express app.

When detection can't be sure, it already errs toward the Express lane. The two helpers below let you
**force the Express lane** for a specific route when you want Express-only behavior guaranteed
(e.g. a view engine) without relying on detection.

### `expressLane(fn)` — force the Express lane (works anywhere)

Wrap the handler/middleware. Works with plain functions and arrow functions:

```ts
import { expressLane } from "express-fastify-runtime";

app.get("/page", expressLane((req, res) => res.render("index", { title: "Hi" })));
```

### `@ExpressLane` — decorator form (class-method controllers)

Requires `"experimentalDecorators": true` in your `tsconfig.json`. The Express-lane marker lives on
the decorated method itself — register that method **directly** as the handler; don't `.bind()` it
or wrap it in an arrow first (that creates a new function and drops the marker — use `expressLane()`
for those cases).

```ts
import { ExpressLane } from "express-fastify-runtime";

class PageController {
  @ExpressLane
  page(req, res) {
    res.render("index", { title: "Hi" });
  }
}

const pages = new PageController();
app.get("/page", pages.page); // the decorated method carries the Express-lane marker
```

Everything else stays on the fast lane.

---

## How it works (30 seconds)

```
            your Express app (unchanged)
                      │  compiled once, at startup
        ┌─────────────┴──────────────┐
        ▼                            ▼
  Fastify lane                 Embedded Express lane
  (safe routes & middleware    (real express() instance —
   compiled onto Fastify)       uploads, res.render, streams…)
```

A request is matched by Fastify. If it's a compiled (safe) route, it runs on Fastify's pipeline
with a thin Express-compatible `req`/`res`. If it isn't, Fastify hands the raw request to the
embedded real Express app. **When in doubt, it uses real Express** — it never guesses and
silently changes behavior.

Lane classification, body parsing (`express.json()` → Fastify's parser), router flattening, and
error-handler wiring all happen **once at startup**. There's no per-request framework juggling.

---

## Benchmarks

Numbers are req/s, **median of repeated runs with warmup** (single-shot HTTP benchmarks swing
20–30%, so don't trust one sample — including ours; reproduce with `npm run benchmark:table`).
10 connections, Node on an Apple-silicon laptop. Higher is better.

| Scenario | Express | Fastify | **fast()** | fast/Express | fast/Fastify |
|---|--:|--:|--:|--:|--:|
| Plain JSON route (5 middleware) | 39,976 | 68,112 | **50,552** | **1.26×** | 0.74× |
| JSON DB read | 41,848 | 68,624 | **50,584** | **1.21×** | 0.74× |
| Middleware stack (helmet+morgan+json+custom) | 29,424 | 32,736 | **40,184** | **1.37×** | **1.23×** |
| POST 1KB JSON | 33,018 | 46,752 | **46,696** | **1.41×** | **1.00×** |
| Auth (JWT verify) | 17,636 | 33,976 | **19,360** | **1.10×** | 0.57× |

**Reading the table:**

- `fast()` is **faster than plain Express** across the board — same code, more throughput.
- It **matches or beats Fastify** on middleware-heavy and small-payload workloads.
- On a tight pure-JSON hot path it trails raw Fastify a little — that's the unavoidable cost of
  presenting a real Express `req`/`res`, and it's still well ahead of Express.
- **Auth (JWT):** the gap there isn't the adapter — it's the *library*. Fastify's benchmark uses
  `@fastify/jwt` (built on `fast-jwt`), which is simply faster than `jsonwebtoken`. Want that
  speed in your Express app? Use `fast-jwt` directly in your auth middleware — it's
  framework-agnostic.
- **Uploads** (multipart) run on the Express lane by design (multer), so Fastify's native
  `@fastify/multipart` wins there — expected, not a regression.

Run them yourself:

```bash
npm run benchmark:table          # the table above (warmup + median)
npm run benchmark:fast-vs-fastify   # fast() vs plain Fastify, MW=0 and MW=5
npm run benchmark                 # full suite: express / fastify / node-http / runtime
```

---

## Compatibility & guarantees

- **Express 4 → 5 upward.** Legacy apps and modern apps. The goal is that adding `fast()`
  changes your throughput, not your behavior.
- **Concurrency-safe.** Every in-flight request gets its own `req`/`res` — heavily tested under
  concurrent async load (no cross-talk, correct morgan logs per request).
- **Supported:** `app.use` / `app.METHOD` / `app.all`, `express.Router()` (flattened when safe),
  `req.body|query|params|headers|cookies`, `res.status|json|send|sendStatus|set|get|redirect|cookie|type|end`,
  streaming via `res.write`/`res.end`, async handlers, global `(err, req, res, next)` error
  middleware, `express.json()`/`urlencoded`.
- **Express lane (real Express):** multipart/uploads, `res.render` + view engines,
  `res.sendFile`, stream-based middleware, RegExp route paths — or anything you mark with
  `expressLane()`.

**Middleware semantics:** the chain is continuation-based, exactly like Express's router —
`next()` advances the chain however it's called: synchronously, from an `async/await` handler,
or from a detached callback / `setTimeout` / promise (classic callback-style middleware). A
middleware that ends the response without calling `next()` stops the chain. The only thing that
"hangs" is a handler that never calls `next()` and never responds — which hangs in real Express
too.

---

## Contributing

PRs welcome — the bar is "it stays Express-correct **and** fast."

```bash
npm install
npm run build         # tsc → dist (CommonJS)
npm test              # unit + integration (incl. concurrency / parity / error-handling)
npm run benchmark:table
```

Rules of the road:

1. **Correctness beats speed, always.** Adding `fast()` must never change Express behavior. If a
   perf idea risks that, it doesn't ship.
2. **No shared per-request state.** Each request gets its own `req`/`res`. Never reintroduce a
   single mutated adapter object — it corrupts concurrent async requests. Validate every
   perf change with concurrent **async** handlers (`test/integration/concurrency.test.js`).
3. **Imports are CommonJS, no file extensions** (matches the current `tsconfig`).
4. **Add a test** for any behavior you touch; keep the full suite green (`npm test`).
5. **Measure with `npm run benchmark:table`** (warmup + median), not single-shot runs.
6. Update `docs/` and `changelog/log-YYYY-MM-DD.md` for notable changes.

See `docs/` for deeper notes: `SPEC.md`, `HOW_EXPRESS_LANE_WORKS.md`,
`FAST_PRODUCTION_CHECKLIST.md`, `OPTIMIZATION.md`, `EXPRESS_FEATURES.md`.

## Reporting issues

Found a bug or have a feature request? Open an issue on
**[GitHub Issues](https://github.com/John-Daniels/express-fastify-runtime/issues)**.

To help us reproduce quickly, please include:

- **Versions** — `express-fastify-runtime`, `express` (4 or 5), `fastify`, and Node.
- **Lane** — run `fast(app, { experimental: { diagnostics: true } })` and note whether the failing
  request logs `Fastify lane` or `Express lane`.
- **A minimal repro** — the smallest app/route that triggers it, plus the full error stack (not just
  the message) and the request (method, path, content-type, body).

Security issue? Please report it privately to the maintainer rather than opening a public issue.

## License

MIT
