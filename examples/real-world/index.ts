import { createApp } from "../../src/index.js";
import usersRouter from "./routes/users.js";
import type {
  ExpressRequest,
  ExpressResponse,
} from "../../src/types/express.js";

const app = createApp({ dev: true });

// Standard Express middleware (will run in Express Lane if unsafe, or Fastify Lane if safe)
// Note: In v0.1.0, express.json() is automatically handled/intercepted for Fastify compatible routes
// but for Express Lane routes, the underlying Express app handles it.

// Mount the Router
// This is supported via the Express Lane fallback
// We cast to any because our ExpressHandler type is stricter than Express's Router
app.use("/api/users", usersRouter as any);

// A safe route (runs in Fastify Lane, high performance)
app.get("/", (req: ExpressRequest, res: ExpressResponse) => {
  res.json({ message: "Hello from Fastify Lane (Safe Route)" });
});

// Start the server
const port = 3000;
app.listen(port, () => {
  console.log(`Real-world example running at http://localhost:${port}`);
  console.log("Try: curl http://localhost:3000/api/users");
});
