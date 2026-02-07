# Real-World Example: Routes & Controllers

This example demonstrates how to use `express-fastify-runtime` with a standard Express application structure, including:

- `routes/`: Express Routers
- `controllers/`: Request handlers
- `index.ts`: Application entry point

## How it works

- **Express Routers**: Routes in `routes/users.ts` use `express.Router()`. The runtime **flattens** routers (including `router.use(path, fn)` middleware) into the route store when you load express-fastify-runtime before creating routers, so they can run on the **Fastify lane** (~18k req/s). Nested routers are flattened recursively. RegExp or unsupported paths fall back to the Express lane.
- **Fastify Safe Routes**: Routes defined directly on `app` (like `app.get('/')` in `index.ts`) are compiled to **Fastify Lane** for high performance.

## Running the example

1. **Install dependencies** (from root):

   ```bash
   npm install
   ```

2. **Run the example**:

   ```bash
   npx tsx examples/real-world/index.ts
   ```

3. **Test endpoints**:
   - **Fastify Lane (Fast)**:

     ```bash
     curl http://localhost:3000/
     # {"message":"Hello from Fastify Lane (Safe Route)"}
     ```

   - **Express Lane (Compatible)**:
     ```bash
     curl http://localhost:3000/api/users
     # [{"id":1,"name":"Alice",...}]
     ```
