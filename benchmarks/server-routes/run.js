#!/usr/bin/env node
/**
 * Run routes benchmark: Express with Router vs express-fastify-runtime with Router.
 * Hits GET /api/auth/bar (router.use('/auth') + router.get('/auth/bar')).
 *
 * Usage: node benchmarks/run-routes.js [--express] [--runtime]
 * Default: run both.
 */

const { spawn } = require("node:child_process");
const net = require("node:net");
const { join } = require("node:path");
const { sample, fmtSample, COOLDOWN, SETTINGS } = require("../lib/bench");

const rootDir = join(__dirname, "../..");

const BASE_PORT = Number(process.env.PORT) || 3001;
const MW = process.env.MW || "5";
const DURATION = process.env.DURATION || "5";

const targets = [];
if (process.argv.includes("--express")) targets.push("express-routes");
if (process.argv.includes("--runtime"))
  targets.push("express-fastify-runtime-routes");
if (process.argv.includes("--runtime-fast"))
  targets.push("express-fastify-runtime-routes-fast");
if (targets.length === 0) {
  targets.push("express-routes", "express-fastify-runtime-routes", "express-fastify-runtime-routes-fast");
}

const ports = {
  "express-routes": BASE_PORT,
  "express-fastify-runtime-routes": BASE_PORT + 3,
  "express-fastify-runtime-routes-fast": BASE_PORT + 4,
};

const serverFiles = {
  "express-routes": join(__dirname, "express-routes.js"),
  "express-fastify-runtime-routes": join(__dirname, "express-fastify-runtime-routes.js"),
  "express-fastify-runtime-routes-fast": join(__dirname, "express-fastify-runtime-routes-fast.js"),
};

const benchmarkPath = "/api/auth/bar";

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
  console.log("  " + fmtSample(await sample({ url: `http://127.0.0.1:${port}${benchmarkPath}` })));
}

async function runOne(name) {
  const port = ports[name];
  const file = serverFiles[name];
  const child = spawn(process.execPath, [file], {
    stdio: "ignore",
    env: { ...process.env, PORT: String(port), MW, BENCH_AUTO_CLOSE: "1" },
    cwd: rootDir,
  });
  try {
    await waitForPort(port);
    await runAutocannon(port);
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, COOLDOWN));
  }
}

async function main() {
  console.log("Routes benchmark (GET %s, MW=%s) — %s\n", benchmarkPath, MW, SETTINGS);

  for (const name of targets) {
    process.stdout.write(name + ": ");
    try {
      await runOne(name);
    } catch (err) {
      console.log("  error:", err.message);
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
