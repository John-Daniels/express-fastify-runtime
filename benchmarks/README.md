# Benchmarks

Compare **Express**, **Fastify**, **Node.js http**, and **express-fastify-runtime** under the same workload.

## Prerequisites

- Node.js >= 18
- Dependencies installed (`npm install` in repo root)
- Build the runtime: `npm run build`

## Scenario

Same app shape for all four:

- **N** middleware (configurable via `MW=5`)
- One **GET /** route that returns `{ ok: true }`

So we measure: middleware chain + single JSON response.

## Run one server (manual)

Start a server, then use `curl` or a load tool against it.

```bash
# Express (port 3001)
node benchmarks/servers/express.js

# Fastify (port 3002)
node benchmarks/servers/fastify.js

# Node http (port 3003)
node benchmarks/servers/node-http.js

# express-fastify-runtime (port 3004)
node benchmarks/servers/express-fastify-runtime.js
```

## Run benchmark suite

Uses **autocannon** to hit each server in turn (start server in background, run autocannon, stop server).

```bash
npm run benchmark
```

Or run a single target:

```bash
npm run benchmark -- --express
npm run benchmark -- --fastify
npm run benchmark -- --node-http
npm run benchmark -- --runtime
```

## Environment

- `MW` — number of middleware (default `5`)
- `PORT` — base port; each server uses PORT, PORT+1, PORT+2, PORT+3 (default 3001)

## Output

You get requests/sec and latency percentiles for each stack so you can compare Express vs Fastify vs raw http vs express-fastify-runtime.

---

## Routes benchmark (Router + router.use)

Compares **Express with Router** vs **express-fastify-runtime with Router** using the same shape as the integration test: `router.use('/auth', ...)` and `router.get('/auth/bar', ...)` mounted at `/api`. Hits **GET /api/auth/bar**.

```bash
npm run build
npm run benchmark:routes
```

Or run a single target:

```bash
npm run benchmark:routes -- --express
npm run benchmark:routes -- --runtime
```

Same env: `MW`, `PORT`, `DURATION`.
