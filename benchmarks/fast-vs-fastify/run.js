#!/usr/bin/env node
/**
 * Benchmark: fast(expressApp) vs plain Fastify with the same workload.
 * Same app shape: N no-op middleware/hooks + GET / returning JSON.
 * Use this to measure the overhead of our adapter layer when everything is
 * compiled to the Fastify lane (no proxy).
 *
 * Usage:
 *   node benchmarks/fast-vs-fastify/run.js           # MW=5, DURATION=5
 *   node benchmarks/fast-vs-fastify/run.js --minimal # MW=0 (pure route overhead)
 *   MW=0 DURATION=3 node benchmarks/fast-vs-fastify/run.js
 */

import { spawn } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "../..");

const BASE_PORT = Number(process.env.PORT) || 5001;
const MW = process.env.MW ?? (process.argv.includes("--minimal") ? "0" : "5");
const DURATION = process.env.DURATION || "5";

const fastifyPort = BASE_PORT;
const fastPort = BASE_PORT + 1;

const serverDir = join(rootDir, "benchmarks/servers");

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

async function runAutocannon(port) {
  const autocannon = await import("autocannon").catch(() => null);
  if (!autocannon) {
    throw new Error("autocannon not installed (npm i -D autocannon)");
  }
  const result = await autocannon.default({
    url: `http://127.0.0.1:${port}/`,
    duration: Number(DURATION),
    connections: 10,
    pipelining: 1,
  });
  return {
    reqPerSec: result.requests?.average ?? 0,
    latencyMean: result.latency?.mean ?? 0,
  };
}

async function runServer(name, file, port) {
  const child = spawn(process.execPath, [file], {
    stdio: "ignore",
    env: { ...process.env, PORT: String(port), MW, BENCH_AUTO_CLOSE: "1" },
    cwd: rootDir,
  });
  try {
    await waitForPort(port);
    const result = await runAutocannon(port);
    return result;
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function main() {
  console.log("fast() vs Fastify — same workload (MW=%s, duration=%ss)\n", MW, DURATION);

  let fastifyResult;
  let fastResult;

  try {
    process.stdout.write("Fastify (plain): ");
    fastifyResult = await runServer("fastify", join(serverDir, "fastify.js"), fastifyPort);
    console.log(
      "req/s: %s | latency mean: %s ms",
      fastifyResult.reqPerSec.toFixed(0),
      fastifyResult.latencyMean.toFixed(2)
    );
  } catch (err) {
    console.log("error:", err.message);
    process.exit(1);
  }

  try {
    process.stdout.write("fast(express):    ");
    fastResult = await runServer(
      "fast",
      join(serverDir, "express-fastify-runtime-fast.js"),
      fastPort
    );
    console.log(
      "req/s: %s | latency mean: %s ms",
      fastResult.reqPerSec.toFixed(0),
      fastResult.latencyMean.toFixed(2)
    );
  } catch (err) {
    console.log("error:", err.message);
    process.exit(1);
  }

  const overhead =
    fastifyResult.reqPerSec > 0
      ? ((1 - fastResult.reqPerSec / fastifyResult.reqPerSec) * 100).toFixed(1)
      : "—";
  const ratio =
    fastifyResult.reqPerSec > 0
      ? (fastResult.reqPerSec / fastifyResult.reqPerSec).toFixed(3)
      : "—";

  console.log("\n---");
  console.log("fast(express) / Fastify ratio: %s (1.0 = same speed)", ratio);
  console.log("Overhead (how much slower fast() is): %s%%", overhead);
  console.log("\nSee benchmarks/fast-vs-fastify/README.md for why there is a gap.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
