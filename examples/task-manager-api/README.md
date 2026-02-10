# Task Manager API (real-world example)

Minimal API that mirrors a real app: **express-fastify-runtime** loaded first, `/v1` deep routes, 404 handler, and JSON response shape.

## Run from repo root (after `npm run build`)

```bash
# Start server
node examples/task-manager-api/index.js

# Smoke test (GET / and /v1/tasks must return 200)
node examples/task-manager-api/test.js
```

## Endpoints

| Method | Path          | Description   |
|--------|---------------|---------------|
| GET    | /             | Root message  |
| GET    | /health       | Health check  |
| GET    | /v1/tasks     | List tasks    |
| POST   | /v1/tasks     | Create task   |
| GET    | /v1/tasks/:id | Get one task  |

Any other path returns `404` with `{ "status": "error", "message": "Not Found", "data": {} }`.

## Why this example exists

- **Load order:** First line loads `express-fastify-runtime` so the router Layer is patched and routes compile to the Fastify lane.
- **Patch from main:** The runtime also patches the router from the main script’s directory (e.g. `examples/task-manager-api` → `examples/node_modules/router`), so the same copy Express uses gets patched when the app lives in a subfolder.
- **404 handler:** Catch-all `app.use((req, res) => respond(404))` runs only when no route matches; middleware order in the compiler ensures route handlers run before it.

Use this app to verify your setup and that GET `/` and `/v1/*` return 200, not 404.
