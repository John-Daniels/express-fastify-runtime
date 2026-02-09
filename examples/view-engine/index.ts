/**
 * Example: res.render() with EJS view engine.
 *
 * With fast(), res.render is only available on the Express lane. This example uses
 * expressLane(fn) for /page and @ExpressLane() for /page-decorator so those routes
 * run on the Express lane where res.render works.
 *
 * For @ExpressLane() to compile, run from this directory so tsconfig.json
 * (experimentalDecorators) is used: cd examples/view-engine && npx tsx index.ts
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { fast, expressLane, ExpressLane } from "../../dist/index.js";

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Fastify lane: plain JSON (no view)
app.get("/", (_req, res) => {
  res.json({ message: "Use GET /page for the EJS-rendered page" });
});

// Express lane: expressLane() marks this handler so it is not compiled to Fastify
app.get(
  "/page",
  expressLane((req, res) => {
    const name = (req.query?.name as string | undefined) || "World";
    res.render("index", {
      title: "Hello from EJS",
      message: `Rendered with res.render() — hello, ${name}!`,
    });
  }),
);

// Same thing using the @ExpressLane() decorator (requires experimentalDecorators in tsconfig)
class PageController {
  @ExpressLane()
  page(req: express.Request, res: express.Response) {
    const name = (req.query.name as string) || "World";
    res.render("index", {
      title: "Hello from EJS (decorator)",
      message: `Rendered with @ExpressLane() — hello, ${name}!`,
    });
  }
}
const pageController = new PageController();
// Use expressLane so the route stays on the Express lane (bound methods lose the EXPRESS_LANE symbol)
app.get(
  "/page-decorator",
  expressLane((req, res) => pageController.page.call(pageController, req, res)),
);

const fastApp = fast(app);
const server = fastApp.server;

const PORT = Number(process.env.PORT) || 3019;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`View engine example: http://127.0.0.1:${PORT}`);
  console.log("  GET /             → JSON (Fastify lane)");
  console.log("  GET /page         → EJS (Express lane, expressLane(fn))");
  console.log("  GET /page-decorator → EJS (Express lane, @ExpressLane())");
});
