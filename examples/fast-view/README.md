# fast() with res.render (EJS)

This example shows **fast(expressApp)** with **res.render()** and the **EJS** view engine.

## Why expressLane() for /page?

With **fast()**, `res.render` is only available on the **Express lane**. We wrap the page handler with **expressLane(fn)** so that route is not compiled to Fastify and always runs on the Express lane. See [FAST_PRODUCTION_CHECKLIST.md](../../docs/FAST_PRODUCTION_CHECKLIST.md) ("Keeping a route on the Express lane") for the decorator option (**@ExpressLane()**) and RegExp-path alternative.

## Run

From the repo root:

```bash
npm run build
npx tsx examples/fast-view/index.ts
```

Then:

- **GET /** → JSON (Fastify lane)
- **GET /page** or **GET /page?name=You** → EJS-rendered HTML (Express lane)

## See also

- **examples/view-engine/** — Same pattern (EJS + res.render) with a bit more comment focus on view engine setup.
- **docs/EXPRESS_FEATURES.md** — `res.render` is "Express lane only" for fast().
