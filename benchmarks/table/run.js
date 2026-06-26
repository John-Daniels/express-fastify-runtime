#!/usr/bin/env node
/**
 * Trustworthy benchmark table: warmup + interleaved median over N rounds, printed as Markdown.
 * Compares express vs fastify vs fast(express) across the key scenarios on the SAME machine run,
 * so the numbers can be quoted in the README without single-sample noise.
 *
 * Usage:
 *   node benchmarks/table/run.js
 *   ROUNDS=5 DURATION=3 WARMUP=2 MW=5 node benchmarks/table/run.js
 */

const { spawn } = require("node:child_process");
const net = require("node:net");
const { join } = require("node:path");
const crypto = require("node:crypto");

const rootDir = join(__dirname, "../..");
const ROUNDS = Number(process.env.ROUNDS || 5);
const DURATION = Number(process.env.DURATION || 3);
const WARMUP = Number(process.env.WARMUP || 2);
// conns=10 was idle-bound (~30% CPU idle) → noisy and understated fast(). Use many concurrent
// connections (realistic, pipelining=1) so the result is stable without the distortion that HTTP
// pipelining introduces (pipelining batches favor Fastify's pipeline and misrepresent normal load).
const CONNECTIONS = Number(process.env.CONNECTIONS || 50);
const PIPELINING = Number(process.env.PIPELINING || 1);
const MW = process.env.MW || "5";
const BASE = Number(process.env.PORT) || 6001;

const VARIANTS = ["express", "fastify", "express-fastify-runtime-fast"];
const LABEL = { express: "Express", fastify: "Fastify", "express-fastify-runtime-fast": "fast()" };

// Each scenario: dir, request url path, method, optional JSON body, optional auth (login path).
const oneKB = JSON.stringify({ s: "x".repeat(1024) });
const SCENARIOS = [
  { name: "Plain JSON route (MW=5)", dir: "servers", path: "/", method: "GET" },
  { name: "JSON DB read", dir: "json-db-test", path: "/todos", method: "GET" },
  { name: "Middleware stack", dir: "middleware-stack", path: "/", method: "GET" },
  { name: "POST 1KB JSON", dir: "payloads", path: "/", method: "POST", body: oneKB },
  { name: "Auth (JWT)", dir: "auth", path: "/protected", method: "GET", login: "/login" },
];

function waitForPort(port, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tc = () => {
      const s = net.connect(port, "127.0.0.1", () => { s.destroy(); resolve(); });
      s.on("error", () => (Date.now() - start > timeoutMs ? reject(new Error("timeout " + port)) : setTimeout(tc, 30)));
    };
    tc();
  });
}
function median(a) { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m-1]+s[m])/2; }

async function sample(opts, dur) {
  const autocannon = (await import("autocannon")).default;
  const r = await autocannon({ ...opts, connections: CONNECTIONS, pipelining: PIPELINING, duration: dur });
  return r.requests?.average ?? 0;
}

async function getToken(port, loginPath) {
  const res = await fetch(`http://127.0.0.1:${port}${loginPath}`);
  const j = await res.json();
  return j.token;
}

// Measure each variant in ISOLATION (only that one server running). Running all variants at once
// makes the measured server fight the other Node processes + the load generator for cores on a
// laptop, which produced impossible results (e.g. fast() 1.4× Fastify). One server at a time is the
// reliable method (matches benchmarks/servers/run.js).
async function measureVariant(scn, v, port) {
  const child = spawn(process.execPath, [join(__dirname, "..", scn.dir, v + ".js")], {
    stdio: "ignore",
    env: { ...process.env, PORT: String(port), MW, BENCH_AUTO_CLOSE: "1" },
    cwd: rootDir,
  });
  try {
    await waitForPort(port);
    const headers = { "content-type": "application/json" };
    if (scn.login) headers.Authorization = `Bearer ${await getToken(port, scn.login)}`;
    const opts = { url: `http://127.0.0.1:${port}${scn.path}`, method: scn.method, headers, body: scn.body };
    await sample(opts, WARMUP); // warmup (discarded)
    const runs = [];
    for (let r = 0; r < ROUNDS; r++) runs.push(await sample(opts, DURATION));
    return median(runs);
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500)); // cooldown before the next variant
  }
}

async function runScenario(scn, portBase) {
  const med = {};
  let i = 0;
  for (const v of VARIANTS) med[v] = await measureVariant(scn, v, portBase + i++);
  return med;
}

async function main() {
  console.log(`# Benchmark table (median of ${ROUNDS}×${DURATION}s, ${WARMUP}s warmup, conns=${CONNECTIONS}, pipelining=${PIPELINING}, MW=${MW})\n`);
  console.log("| Scenario | Express | Fastify | fast() | fast/Express | fast/Fastify |");
  console.log("|---|--:|--:|--:|--:|--:|");
  let portBase = BASE;
  for (const scn of SCENARIOS) {
    let med;
    try {
      med = await runScenario(scn, portBase);
    } catch (e) {
      console.log(`| ${scn.name} | error: ${e.message} |`);
      portBase += 10;
      continue;
    }
    const e = med["express"], f = med["fastify"], x = med["express-fastify-runtime-fast"];
    const fmt = (n) => Math.round(n).toLocaleString("en-US");
    console.log(
      `| ${scn.name} | ${fmt(e)} | ${fmt(f)} | ${fmt(x)} | ${(x/e).toFixed(2)}× | ${(x/f).toFixed(2)}× |`,
    );
    portBase += 10;
  }
  console.log("\n_req/s, higher is better. fast/Express and fast/Fastify are ratios (1.00× = same speed)._");
}

main().catch((e) => { console.error(e); process.exit(1); });
