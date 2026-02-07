/**
 * Integration tests: createApp(), use, get, listen, route locking, Router.
 * Run: node --test test/integration/app.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createApp } from '../../dist/index.js';
import { Router } from 'express';

describe('createApp', () => {
  it('returns app with use, get, post, listen', () => {
    const app = createApp();
    assert.strictEqual(typeof app.use, 'function');
    assert.strictEqual(typeof app.get, 'function');
    assert.strictEqual(typeof app.post, 'function');
    assert.strictEqual(typeof app.listen, 'function');
  });

  it('app.use and app.get do not throw before listen', () => {
    const app = createApp();
    app.use((req, res, next) => next());
    app.get('/foo', (req, res) => res.json({ ok: true }));
    assert.ok(true);
  });

  it('app.use after listen throws', async () => {
    const app = createApp();
    app.get('/x', (req, res) => res.end());
    const server = await app.listen(0);
    assert.throws(
      () => app.use((req, res, next) => next()),
      /Cannot add routes or middleware after listen/
    );
    await server.close();
  });

  it('app.get after listen throws', async () => {
    const app = createApp();
    app.get('/y', (req, res) => res.end());
    const server = await app.listen(0);
    assert.throws(
      () => app.get('/z', (req, res) => res.end()),
      /Cannot add routes or middleware after listen/
    );
    await server.close();
  });

  it('app.use(path, express.Router()) flattens router and route responds', async () => {
    const router = Router();
    router.get('/bar', (req, res) => res.json({ from: 'router' }));
    const app = createApp();
    app.use('/api', router);
    const server = await app.listen(0);
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object' && addr.port);
    const res = await fetch(`http://127.0.0.1:${addr.port}/api/bar`);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { from: 'router' });
    await server.close();
  });

  it('app.use(path, router) flattens router with router.use(path, fn) when Layer has _path', async () => {
    const router = Router();
    router.use('/auth', (req, res, next) => next());
    router.get('/auth/bar', (req, res) => res.json({ from: 'router-with-use' }));
    const app = createApp();
    app.use('/api', router);
    const server = await app.listen(0);
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object' && addr.port);
    const res = await fetch(`http://127.0.0.1:${addr.port}/api/auth/bar`);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { from: 'router-with-use' });
    await server.close();
  });
});
