# Tests

Tests use **Node.js built-in test runner** (`node --test`). No extra test framework dependency.

## Run all tests

```bash
npm test
```

## Run specific file

```bash
node --test test/unit/path.test.js
node --test test/unit/detect.test.js
node --test test/integration/app.test.js
```

## Layout

- **test/unit/** — RouteStore, classify, detect, path, assert (no server).
- **test/integration/** — createApp(), use/METHOD/listen, route locking, request/response (spawn server or use light-my-request).
- **test/fixtures/** — shared fixtures if needed.

## Adding tests

- Use `import test from 'node:test'` and `import assert from 'node:assert'`.
- File names: `*.test.js` or `*.test.mjs` (or `.ts` if ts-node/tsx is used).
- Keep tests fast; integration tests can use a random port and short timeouts.
