/**
 * Example: fast(expressApp) with res.render() and EJS.
 *
 * res.render is only available on the Express lane. We use expressLane(fn) so the
 * /page route is explicitly marked to run on the Express lane (not compiled to Fastify).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { fast, expressLane } from "../../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Fastify lane: string path → compiled to Fastify
app.get("/", (_req, res) => {
  res.json({ message: "fast() + EJS example. Try GET /page" });
});

// Express lane: expressLane() so this route is not compiled to Fastify
app.get("/page", expressLane((req, res) => {
  const name = (req.query.name as string) || "World";
  res.render("index", {
    title: "fast() + EJS",
    message: `res.render() on the Express lane — hello, ${name}!`,
  });
}));

const fastApp = fast(app);
const server = fastApp.server;

const PORT = Number(process.env.PORT) || 3007;
server.listen(PORT, () => {
  console.log(`fast() + view example: http://127.0.0.1:${PORT}`);
  console.log("  GET /      → JSON (Fastify lane)");
  console.log("  GET /page  → EJS HTML (Express lane, res.render)");
});
