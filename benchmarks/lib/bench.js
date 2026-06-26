/**
 * Shared benchmark harness — the ONE place the measurement methodology lives, so every benchmark
 * tells the truth the same way.
 *
 * Why this exists: the old per-runner config (connections:10, pipelining:1, no warmup, single
 * round, 300ms cooldown) was idle-bound and noise-prone on a loopback/laptop — the same code
 * measured 47k→68k→118k req/s across runs, which made fast() look *slower than Express* on a hot
 * laptop. That was a measurement artifact, not reality.
 *
 * This harness fixes it with: WARMUP (discard cold-JIT samples), more CONNECTIONS (reduce idle),
 * MEDIAN of ROUNDS (reject thermal/scheduling outliers), and a real COOLDOWN between servers
 * (no carryover). All knobs are env-overridable. For a pure CPU-efficiency view, set PIPELINING>1
 * (small in-memory routes only — do NOT pipeline large-body/upload benchmarks).
 *
 * How to read results: fast() should always be ≥ Express and ≈ createApp (they share the engine);
 * if fast() diverges far from createApp, the machine is throttling — rerun idle. See benchmarks/README.md.
 */

const { spawn } = require("node:child_process");
const net = require("node:net");
const { join } = require("node:path");

const num = (v, d) => (v === undefined || v === "" ? d : Number(v));

const CONNECTIONS = num(process.env.CONNECTIONS, 50);
const PIPELINING = num(process.env.PIPELINING, 1);
const DURATION = num(process.env.DURATION, 3);
const WARMUP = num(process.env.WARMUP, 1);
const ROUNDS = num(process.env.ROUNDS, 3);
const COOLDOWN = num(process.env.COOLDOWN, 750);

const SETTINGS = `conns=${CONNECTIONS}, pipelining=${PIPELINING}, ${ROUNDS}×${DURATION}s measured + ${WARMUP}s warmup (median of ${ROUNDS})`;

function waitForPort(port, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function tryConnect() {
      const socket = net.connect(port, "127.0.0.1", () => {
        socket.destroy();
        resolve();
      });
      socket.on("error", () => {
        if (Date.now() - start > timeoutMs) reject(new Error(`timeout waiting for port ${port}`));
        else setTimeout(tryConnect, 30);
      });
    })();
  });
}

let _autocannon;
async function getAutocannon() {
  if (_autocannon !== undefined) return _autocannon;
  try {
    _autocannon = (await import("autocannon")).default;
  } catch (_) {
    _autocannon = null;
  }
  return _autocannon;
}

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * One trustworthy measurement: a discarded warmup, then the median of ROUNDS measured runs.
 * opts: { url, method?, body?, headers?, connections?, pipelining?, duration? }
 * Returns { reqs, lat } (medians) or null if autocannon isn't installed.
 */
async function sample(opts) {
  const autocannon = await getAutocannon();
  if (!autocannon) return null;
  const base = {
    url: opts.url,
    connections: opts.connections ?? CONNECTIONS,
    pipelining: opts.pipelining ?? PIPELINING,
  };
  // Only set these when provided — autocannon rejects `method: undefined` ("undefined HTTP method").
  if (opts.method) base.method = opts.method;
  if (opts.body !== undefined) base.body = opts.body;
  if (opts.headers) base.headers = opts.headers;
  if (WARMUP > 0) await autocannon({ ...base, duration: WARMUP });
  const reqs = [];
  const lats = [];
  for (let i = 0; i < ROUNDS; i++) {
    const r = await autocannon({ ...base, duration: opts.duration ?? DURATION });
    reqs.push(r.requests.average);
    lats.push(r.latency.mean);
  }
  return { reqs: median(reqs), lat: median(lats) };
}

function fmtSample(s) {
  if (!s) return "(install autocannon: npm i -D autocannon)";
  return `req/s: ${s.reqs.toFixed(0)} | latency mean: ${s.lat.toFixed(2)} ms`;
}

/** Spawn a server file, wait for its port, run fn(), then SIGTERM + cooldown. */
async function withServer(file, env, fn) {
  const child = spawn(process.execPath, [file], {
    stdio: "ignore",
    env: { ...process.env, ...env, BENCH_AUTO_CLOSE: "1" },
    cwd: join(__dirname, "../.."),
  });
  try {
    await waitForPort(Number(env.PORT));
    return await fn();
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, COOLDOWN));
  }
}

module.exports = {
  waitForPort,
  sample,
  fmtSample,
  withServer,
  median,
  SETTINGS,
  CONNECTIONS,
  PIPELINING,
  DURATION,
  WARMUP,
  ROUNDS,
  COOLDOWN,
};
