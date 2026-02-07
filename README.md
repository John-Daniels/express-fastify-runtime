# express-fastify-runtime

Run existing Express apps on **Fastify** safely, faster, and without code changes. This is a **hybrid runtime**: Fastify orchestrates; Express executes when required.

## Guarantees

- **Express compatibility**: Same API (`app.use`, `app.get`, `req`, `res`, `next`); existing apps run unchanged.
- **Middleware safety**: `morgan`, `helmet`, `express.json()`, auth, and similar run on the Fastify lane; `multer` and stream-based middleware run on the real Express lane.
- **Performance**: Hot paths run on Fastify; unsafe paths fall back to real Express. No silent failures; fail fast in dev.

## Architecture

```
Express-Compatible API (what users write)
         ↓ compile-time
Route Classifier (safe vs unsafe middleware)
    ↓                    ↓
Fastify Lane        Embedded Express Lane
(compiled)          (real Express engine)
```

## Usage

```ts
import { createApp } from 'express-fastify-runtime';

const app = createApp();

app.use((req, res, next) => { /* middleware */ next(); });
app.get('/api/users', (req, res) => res.json({ users: [] }));

app.listen(3000, () => console.log('Listening on 3000'));
```

## Project structure

See the [project brief](#) for the exact layout. Key modules:

- `src/app/` – Express-like app, route store, classify, compile
- `src/fastify/` – Request/response adapters, register compiled routes
- `src/express/` – Real Express engine, mount (proxy Fastify → Express)
- `src/runtime/` – Lifecycle (boot, lock, listen), error handler

## Rules

1. **Routes are immutable after `listen()`** – `app.use()` / `app.get()` after `listen()` throw.
2. **Compile once** – No runtime middleware resolution; no dynamic routing.
3. **Unsafe → Express lane** – If middleware is unsure, it runs on Express.
4. **Express lane uses real Express** – Not a reimplementation.

## Supported (v1)

- `app.use(fn)`, `app.METHOD(path, ...handlers)`
- `req.body`, `req.query`, `req.params`, `res.status().send().json().set()`, `next()`
- Async handlers, global error middleware

## Not supported (v1)

- `express.Router()` is supported: `app.use(path?, router)` flattens the router (including `router.use(path, fn)` and nested routers) so they can run on the Fastify lane. Load express-fastify-runtime before creating routers. RegExp or unsupported paths fall back to the Express lane.
- `res.locals`, runtime mutation of middleware stack (fail loudly if used).

## Build, test & run

```bash
npm install
npm run build
npm test
node dist/examples/auth.js
```

## Benchmarks

Compare Express, Fastify, Node `http`, and express-fastify-runtime:

```bash
npm i -D autocannon   # if not already installed
npm run benchmark
```

See `benchmarks/README.md` for details.

## Spec & tests

- **Spec:** `docs/SPEC.md` — architecture, guarantees, and implementation checklist for continuing work.
- **Tests:** `test/` — unit (path, detect, assert) and integration (createApp, route locking). Run with `npm test`.

## License

MIT
