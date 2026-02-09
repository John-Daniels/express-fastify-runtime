# fast() scenario benchmarks

Compare **Express** vs **fast(expressApp)** across different workloads to see where fast() wins and where it fails or degrades.

## Run

```bash
npm run build
npm run benchmark:fast
```

## Options

- `--express` — run only Express
- `--fast` — run only fast()
- `--scenario=ID` — run one scenario (e.g. `baseline`, `many-routes`, `express-lane`)
- `DURATION=N` — seconds per run (default 3)

## Scenarios

| ID | Workload | What it stresses |
|----|----------|------------------|
| baseline | 5 middleware, GET / json | Basic Fastify lane |
| many-routes | 30 GET routes /r/1..30 | Route table size |
| deep-middleware | 25 middleware, GET / | Middleware chain depth |
| json-body | POST / with 1KB JSON, express.json() | Body parsing path |
| headers | GET / with req.get(), cookies | Request adapter (get, cookies) |
| redirect | GET /r → res.redirect(302, /) | Response adapter redirect |
| send-string | res.send('hello') | Response send path |
| express-lane | RegExp route GET /x | Every request hits Express (notFoundHandler) |

## Reading results

- **Ratio > 1** — fast() is faster than Express.
- **Ratio < 1** — fast() is slower (adapter cost, or Express lane overhead).
- **express-lane** — baseline for “all requests go to Express”; if ratio is still ≥ 1, Fastify’s server + adapter is not worse than raw Express for that path.
