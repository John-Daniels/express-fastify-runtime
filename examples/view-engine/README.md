# View engine example: res.render() with EJS

This example shows how to use **res.render()** with the **EJS** view engine when running your Express app with **fast(expressApp)**.

**For a dedicated fast() + views example**, see **examples/fast-view/**.

## Why expressLane() for /page?

With `fast()`, **res.render** is only available on the **Express lane** (see [EXPRESS_FEATURES.md](../../docs/EXPRESS_FEATURES.md)). This example wraps the page handler with **expressLane(fn)** so the route is not compiled to Fastify and always runs on the Express lane. See [FAST_PRODUCTION_CHECKLIST.md](../../docs/FAST_PRODUCTION_CHECKLIST.md) ("Keeping a route on the Express lane") for the decorator option and RegExp-path alternative.

```ts
app.get("/page", expressLane((req, res) => {
  res.render("index", { title: "Hello from EJS", message: "..." });
}));
```

## Setup

1. From the repo root, install dependencies (includes `ejs` in examples):

   ```bash
   npm install
   ```

2. Build the runtime, then run the example:

   ```bash
   npm run build
   npx tsx examples/view-engine/index.ts
   ```

3. Try it:

   - **Fastify lane (JSON):**
     ```bash
     curl http://127.0.0.1:3006/
     ```
   - **Express lane (EJS-rendered HTML):**
     ```bash
     curl http://127.0.0.1:3006/page
     curl "http://127.0.0.1:3006/page?name=You"
     ```

## Files

- **index.ts** — Express app with `app.set('view engine', 'ejs')`, expressLane-wrapped `/page` route, and `fast(app)`.
- **views/index.ejs** — Simple EJS template used by `res.render('index', { title, message })`.
