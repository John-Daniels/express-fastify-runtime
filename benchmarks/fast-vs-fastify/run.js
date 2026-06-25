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

const ROUNDS = Number(process.env.ROUNDS || 5);
const WARMUP = Number(process.env.WARMUP || 2);

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function startServer(file, port) {
  return spawn(process.execPath, [file], {
    stdio: "ignore",
    env: { ...process.env, PORT: String(port), MW, BENCH_AUTO_CLOSE: "1" },
    cwd: rootDir,
  });
}

async function sample(port, durationSec) {
  const autocannon = await import("autocannon").catch(() => null);
  if (!autocannon) throw new Error("autocannon not installed (npm i -D autocannon)");
  const result = await autocannon.default({
    url: `http://127.0.0.1:${port}/`,
    duration: durationSec,
    connections: 10,
    pipelining: 1,
  });
  return result.requests?.average ?? 0;
}

async function main() {
  console.log(
    "fast() vs Fastify — same workload (MW=%s, sample=%ss, warmup=%ss, rounds=%s, interleaved median)\n",
    MW,
    DURATION,
    WARMUP,
    ROUNDS,
  );

  const fastifyChild = startServer(join(serverDir, "fastify.js"), fastifyPort);
  const fastChild = startServer(join(serverDir, "express-fastify-runtime-fast.js"), fastPort);

  try {
    await Promise.all([waitForPort(fastifyPort), waitForPort(fastPort)]);

    // Warmup both (discarded) so JIT/GC settle before measuring.
    await sample(fastifyPort, WARMUP);
    await sample(fastPort, WARMUP);

    const fastifySamples = [];
    const fastSamples = [];
    for (let r = 0; r < ROUNDS; r++) {
      // Interleave so thermal/scheduler drift hits both runs equally.
      fastifySamples.push(await sample(fastifyPort, Number(DURATION)));
      fastSamples.push(await sample(fastPort, Number(DURATION)));
    }

    const fastifyMed = median(fastifySamples);
    const fastMed = median(fastSamples);
    const fmt = (a) => a.map((n) => n.toFixed(0)).join(", ");
    console.log("Fastify (plain) req/s: median %s  [%s]", fastifyMed.toFixed(0), fmt(fastifySamples));
    console.log("fast(express)   req/s: median %s  [%s]", fastMed.toFixed(0), fmt(fastSamples));

    const ratio = fastifyMed > 0 ? (fastMed / fastifyMed).toFixed(3) : "—";
    const overhead = fastifyMed > 0 ? ((1 - fastMed / fastifyMed) * 100).toFixed(1) : "—";
    console.log("\n---");
    console.log("fast(express) / Fastify ratio: %s (1.0 = same speed)", ratio);
    console.log("Overhead (how much slower fast() is): %s%%", overhead);
  } finally {
    fastifyChild.kill("SIGTERM");
    fastChild.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
