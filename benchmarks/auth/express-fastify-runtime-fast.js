/**
 * Auth benchmark: fast(expressApp) — same app as express.js.
 * Load runtime first so Router is patched before Express (best practice for fast()).
 */
import "../../dist/index.js";
import express from "express";
import jwt from "jsonwebtoken";
import { fast } from "../../dist/index.js";
import { SECRET, PAYLOAD } from "./shared.js";

const app = express();
const PORT = Number(process.env.PORT) || 3004;

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No token" });

  const token = authHeader.split(" ")[1];
  try {
    const user = jwt.verify(token, SECRET);
    req.user = user;
    next();
  } catch (err) {
    res.status(403).json({ error: "Invalid token" });
  }
};

app.get("/login", (req, res) => {
  const token = jwt.sign(PAYLOAD, SECRET);
  res.json({ token });
});

app.get("/protected", authMiddleware, (req, res) => {
  res.json({ message: "Success", user: req.user });
});

const fastApp = fast(app);
const server = fastApp.server;
server.listen(PORT, () => {});

if (process.env.BENCH_AUTO_CLOSE !== "1") {
  process.on("SIGINT", () => server.close());
}
