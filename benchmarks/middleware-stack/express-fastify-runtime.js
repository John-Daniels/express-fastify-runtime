import { createApp } from "../../dist/index.js";
import helmet from "helmet";
import morgan from "morgan";
import express from "express"; // for express.json/urlencoded

const app = createApp();
const PORT = Number(process.env.PORT) || 3003;

// 1. Helmet
app.use(helmet());

// 2. Morgan
app.use(morgan("tiny", { stream: { write: () => {} } }));

// 3. Body Parsing (Using standard Express middleware)
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// 4. Custom Middleware
app.use((req, res, next) => {
  req.context = { timestamp: Date.now(), user: "guest" };
  next();
});

// 5. Rate Limiter Simulation
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
  // console.log(`Runtime middleware stack listening on ${PORT}`);
});
