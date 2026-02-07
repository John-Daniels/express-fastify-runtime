import express from "express";
import helmet from "helmet";
import morgan from "morgan";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// 1. Helmet (Security Headers)
app.use(helmet());

// 2. Morgan (Logging) - 'tiny' to minimize console spam during bench, but consume CPU
app.use(morgan("tiny", { stream: { write: () => {} } })); // No-op stream to measure CPU overhead without IO block

// 3. Body Parsing
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// 4. Custom Middleware (Request Context)
app.use((req, res, next) => {
  req.context = { timestamp: Date.now(), user: "guest" };
  next();
});

// 5. Rate Limiter Simulation (Simple counter)
const rateLimit = new Map();
app.use((req, res, next) => {
  const ip = req.ip || "127.0.0.1";
  const count = rateLimit.get(ip) || 0;
  rateLimit.set(ip, count + 1);
  next();
});

app.get("/", (req, res) => {
  res.json({ message: "Hello Middleware", context: req.context });
});

app.listen(PORT, () => {
  // console.log(`Express middleware stack listening on ${PORT}`);
});
