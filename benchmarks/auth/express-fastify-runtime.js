import { createApp } from "../../dist/index.js";
import jwt from "jsonwebtoken";
import { SECRET, PAYLOAD } from "./shared.js";

const app = createApp();
const PORT = Number(process.env.PORT) || 3003;

// Middleware to verify JWT (Same as Express)
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

app.listen(PORT, () => {});
