# Express 5.2.1 as reference

We use **Express 5.2.1** (`express-5.2.1/`) as the canonical reference for request/response API behavior so existing Express apps work unchanged. When in doubt, we align with Express’s semantics (e.g. `req.accepts`, `req.is`, `req.range`, `res.location('back')`, Referer/Referrer in `req.get`).

## What we align with

- **Request/response API**: Same method names, signatures, and semantics where we support a feature (see [EXPRESS_FEATURES.md](./EXPRESS_FEATURES.md)).
- **Libraries**: We use the same small packages where it keeps behavior identical: `accepts`, `type-is`, `range-parser`, `encodeurl`, so we don’t reimplement and drift.
- **Edge cases**: e.g. `req.get('Referer')` / `req.get('Referrer')` both return the same header; `res.location('back')` → Referrer or `/`; `res.clearCookie` with `expires: new Date(1)`.

## Mistakes we don’t repeat

1. **Sync `listen()`** – We return `Promise<ServerLike>` and never block. No callback-only API.
2. **`qs` with `allowPrototypes: true`** – Express’s extended query parser allows prototype pollution surface; we use Fastify’s (or a safe parser) and don’t enable that.
3. **Deprecated overloads** – We don’t support `res.send(status, body)`; we use `res.status(status).send(body)` only. No silent deprecation warnings.
4. **Tight coupling to `app` settings** – Features that only work with `app.set('trust proxy')` / `app.get('query parser fn')` we implement with sensible defaults (e.g. trust first hop for `req.ip`) so apps work without app settings in v1; we don’t require a full settings layer to match Express.
5. **Heavy deps in hot path** – We keep adapters lean; we add small, focused deps (`accepts`, `type-is`, `range-parser`, `encodeurl`) and avoid pulling in the whole Express stack.

## Where to look in Express 5.2.1

| Need | File |
|------|------|
| `req.accepts`, `req.is`, `req.range`, `req.protocol`, `req.ip`, `req.fresh` | `lib/request.js` |
| `res.send`, `res.json`, `res.redirect`, `res.sendFile`, `res.cookie` | `lib/response.js` |
| `setCharset`, `normalizeType`, `compileTrust` | `lib/utils.js` |
| Tests for a given API | `test/req.*.js`, `test/res.*.js` |

When adding or changing a feature, check Express’s implementation and tests so we stay compatible without inheriting the pitfalls above.
