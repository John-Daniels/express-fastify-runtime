import "../../dist/index.js";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { fast } from "../../dist/index.js";

const app = express();
const PORT = Number(process.env.PORT) || 3004;

app.use(helmet());
app.use(morgan("tiny", { stream: { write: () => {} } }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  req.context = { timestamp: Date.now(), user: "guest" };
  next();
});

const rateLimit = new Map();
app.use((req, res, next) => {
  const ip = req.ip || "127.0.0.1";
  rateLimit.set(ip, (rateLimit.get(ip) || 0) + 1);
  next();
});

app.get("/", (req, res) => {
  res.json({ message: "Hello Middleware", context: req.context });
});

const fastApp = fast(app);
fastApp.server.listen(PORT, () => {});

if (process.env.BENCH_AUTO_CLOSE !== "1") {
  process.on("SIGINT", () => fastApp.server.close());
}
