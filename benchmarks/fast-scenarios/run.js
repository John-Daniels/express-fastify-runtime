#!/usr/bin/env node
/**
 * Benchmark fast() across multiple scenarios.
 * Runs each scenario with Express and with fast(app), reports req/s and latency.
 * Use to find where fast() fails or degrades.
 *
 * Usage: node benchmarks/fast-scenarios/run.js [--express] [--fast] [--scenario=NAME]
 * Default: run all scenarios, both targets.
 */

import { spawn } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "../..");

const BASE_PORT = Number(process.env.PORT) || 4001;
const DURATION = Number(process.env.DURATION) || 3;

const scenarios = [
  {
    id: "baseline",
    name: "5 mw, GET / json",
    url: "http://127.0.0.1",
    path: "/",
    method: "GET",
    body: undefined,
    headers: undefined,
  },
  {
    id: "many-routes",
    name: "30 routes GET /r/1..30",
    url: "http://127.0.0.1",
    path: "/r/15",
    method: "GET",
    body: undefined,
    headers: undefined,
  },
  {
    id: "deep-middleware",
    name: "25 mw, GET /",
    url: "http://127.0.0.1",
    path: "/",
    method: "GET",
    body: undefined,
    headers: undefined,
  },
  {
    id: "json-body",
    name: "POST / 1KB JSON",
    url: "http://127.0.0.1",
    path: "/",
    method: "POST",
    body: JSON.stringify({ data: "x".repeat(1000) }),
    headers: { "content-type": "application/json" },
  },
  {
    id: "headers",
    name: "GET / req.get, cookies",
    url: "http://127.0.0.1",
    path: "/",
    method: "GET",
    body: undefined,
    headers: { "x-foo": "bar", Cookie: "a=1" },
  },
  {
    id: "redirect",
    name: "GET /r redirect 302",
    url: "http://127.0.0.1",
    path: "/r",
    method: "GET",
    body: undefined,
    headers: undefined,
  },
  {
    id: "send-string",
    name: "res.send('hello')",
    url: "http://127.0.0.1",
    path: "/",
    method: "GET",
    body: undefined,
    headers: undefined,
  },
  {
    id: "express-lane",
    name: "RegExp route (Express lane)",
    url: "http://127.0.0.1",
    path: "/x",
    method: "GET",
    body: undefined,
    headers: undefined,
  },
];

const targets = [];
if (process.argv.includes("--express")) targets.push("express");
if (process.argv.includes("--fast")) targets.push("fast");
if (targets.length === 0) {
  targets.push("express", "fast");
}

const scenarioFilter = process.argv.find((a) => a.startsWith("--scenario="));
const scenarioId = scenarioFilter ? scenarioFilter.split("=")[1] : null;
const runScenarios = scenarioId
  ? scenarios.filter((s) => s.id === scenarioId)
  : scenarios;

if (runScenarios.length === 0) {
  console.error("No scenarios match. Use --scenario=baseline etc.");
  process.exit(1);
}

function waitForPort(port, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function tryConnect() {
      const socket = net.connect(port, "127.0.0.1", () => {
        socket.destroy();
        resolve();
      });
      socket.on("error", () => {
        if (Date.now() - start > timeoutMs)
          reject(new Error(`timeout waiting for port ${port}`));
        else setTimeout(tryConnect, 30);
      });
    }
    tryConnect();
  });
}

async function runAutocannon(scenario, port) {
  const autocannon = await import("autocannon").catch(() => null);
  if (!autocannon) {
    return { reqPerSec: 0, latencyMean: 0, error: "autocannon not installed" };
  }
  const opts = {
    url: `${scenario.url}:${port}${scenario.path}`,
    method: scenario.method,
    duration: DURATION,
    connections: 10,
    pipelining: 1,
  };
  if (scenario.body) {
    opts.body = scenario.body;
    opts.headers = scenario.headers || { "content-type": "application/json" };
  } else if (scenario.headers) {
    opts.headers = scenario.headers;
  }
  const result = await autocannon.default(opts);
  const reqPerSec = result.requests?.average ?? 0;
  const latencyMean = result.latency?.mean ?? 0;
  const errors = result.errors ?? 0;
  return { reqPerSec, latencyMean, errors };
}

async function runOne(scenario, target) {
  const port = BASE_PORT;
  const serverPath = join(__dirname, "server.js");
  const child = spawn(process.execPath, [serverPath], {
    stdio: "ignore",
    env: {
      ...process.env,
      PORT: String(port),
      SCENARIO: scenario.id,
      TARGET: target,
      BENCH_AUTO_CLOSE: "1",
    },
    cwd: rootDir,
  });
  try {
    await waitForPort(port);
    const result = await runAutocannon(scenario, port);
    return result;
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function main() {
  console.log("fast() scenarios (duration=%ss)\n", DURATION);
  console.log("Scenario                    | Express req/s | fast() req/s | ratio  | notes");
  console.log("----------------------------|---------------|---------------|-------|------");

  for (const scenario of runScenarios) {
    let expressReq = 0;
    let expressLat = 0;
    let fastReq = 0;
    let fastLat = 0;
    let errMsg = "";

    if (targets.includes("express")) {
      try {
        const r = await runOne(scenario, "express");
        expressReq = r.reqPerSec;
        expressLat = r.latencyMean;
        if (r.error) errMsg = r.error;
        if (r.errors > 0) errMsg = `express ${r.errors} errors`;
      } catch (e) {
        errMsg = `express: ${e.message}`;
      }
    }

    if (targets.includes("fast")) {
      try {
        const r = await runOne(scenario, "fast");
        fastReq = r.reqPerSec;
        fastLat = r.latencyMean;
        if (r.error && !errMsg) errMsg = r.error;
        if (r.errors > 0) errMsg = (errMsg ? errMsg + "; " : "") + `fast ${r.errors} errors`;
      } catch (e) {
        errMsg = (errMsg ? errMsg + "; " : "") + `fast: ${e.message}`;
      }
    }

    const ratio =
      expressReq > 0 && fastReq > 0 ? (fastReq / expressReq).toFixed(2) : "-";
    const namePad = scenario.name.slice(0, 27).padEnd(27);
    const expressStr = expressReq.toFixed(0).padStart(13);
    const fastStr = fastReq.toFixed(0).padStart(13);
    console.log(
      `${namePad} | ${expressStr} | ${fastStr} | ${ratio.padStart(5)} | ${errMsg || "ok"}`
    );
  }

  console.log("\nDone. Ratio > 1 = fast() faster than Express.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
