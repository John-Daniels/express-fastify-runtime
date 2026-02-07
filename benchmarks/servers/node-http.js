/**
 * Benchmark server: raw Node.js http.
 * Same workload: N no-op steps + JSON response.
 */

import http from 'node:http';

const PORT = Number(process.env.PORT) || 3003;
const n = parseInt(process.env.MW || '5', 10);

const body = JSON.stringify({ ok: true });

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' || req.url !== '/') {
    res.statusCode = 404;
    res.end();
    return;
  }
  // Simulate N middleware steps (no-op)
  let i = 0;
  function next() {
    if (i++ >= n) {
      res.setHeader('Content-Type', 'application/json');
      res.end(body);
    } else {
      setImmediate(next);
    }
  }
  next();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Node http listening on ${PORT} (${n} middleware)`);
});
