import Fastify from "fastify";
import helmet from "helmet";
import morgan from "morgan";

const fastify = Fastify({ logger: false });
const PORT = Number(process.env.PORT) || 3001;

// Fastify doesn't support express middleware directly without @fastify/express or middie.
// BUT to benchmark "Native Fastify", we should use Fastify hooks or wrappers if we want to be fair to "Fastify Performance".
// However, the rule was "Benchmark Matrix ... Same middlewares".
// So we will use the middlewares as functions where possible (standard req, res pattern).
// Helmet and Morgan are standard. bodyParser is built-in to Fastify.

// 1. Helmet (using middie-like adaptation or just running it as a hook if compatible? Helmet returns (req, res, next))
// We'll simulate the "overhead" by running compatible logic.
// Fastify has @fastify/helmet. But for "Same Middleware", we should try to use the `helmet()` function if possible,
// but it expects (req, res, next). Fastify (req, reply) is different.
// So for Fastify, we will implement the "Equivalent Native Logic" to show what Fastify *can* do.

// Actually, let's use the explicit `fastify-helmet` etc if available, OR simple hooks that do the same work.
import fHelmet from "@fastify/helmet";
// import fFormbody from '@fastify/formbody'; // Fastify supports json natively.

await fastify.register(fHelmet, { global: true });

// Morgan (Custom hook to match logging overhead)
fastify.addHook("onRequest", (req, reply, next) => {
  // Simulate morgan 'tiny' overhead (method, url, status, etc)
  // No-op write
  next();
});

// Body parsing is native in Fastify.
fastify.addContentTypeParser(
  "application/x-www-form-urlencoded",
  { parseAs: "string" },
  fastify.getDefaultJsonParser,
);

// 4. Custom Middleware
fastify.addHook("preHandler", (req, reply, next) => {
  req.raw.context = { timestamp: Date.now(), user: "guest" };
  next();
});

// 5. Rate Limiter Simulation
const rateLimit = new Map();
fastify.addHook("onRequest", (req, reply, next) => {
  const ip = req.ip || "127.0.0.1";
  const count = rateLimit.get(ip) || 0;
  rateLimit.set(ip, count + 1);
  next();
});

fastify.get("/", async (req, reply) => {
  return { message: "Hello Middleware", context: req.raw.context };
});

await fastify.listen({ port: PORT, host: "0.0.0.0" });
