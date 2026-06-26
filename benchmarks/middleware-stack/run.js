const { spawn } = require("node:child_process");
const net = require("node:net");
const { join } = require("node:path");
const { sample, fmtSample, COOLDOWN, SETTINGS } = require("../lib/bench");

const rootDir = join(__dirname, "../..");

const BASE_PORT = Number(process.env.PORT) || 3001;
const MW = process.env.MW || "0";
const DURATION = process.env.DURATION || "5";

const targets = [];
if (process.argv.includes("--express")) targets.push("express");
if (process.argv.includes("--fastify")) targets.push("fastify");
if (process.argv.includes("--runtime")) targets.push("express-fastify-runtime");
if (process.argv.includes("--runtime-fast")) targets.push("express-fastify-runtime-fast");
if (targets.length === 0) {
  targets.push("express", "fastify", "express-fastify-runtime", "express-fastify-runtime-fast");
}

const ports = {
  express: BASE_PORT,
  fastify: BASE_PORT + 1,
  "express-fastify-runtime": BASE_PORT + 3,
  "express-fastify-runtime-fast": BASE_PORT + 4,
};

const serverFiles = {
  express: join(__dirname, "express.js"),
  fastify: join(__dirname, "fastify.js"),
  "express-fastify-runtime": join(__dirname, "express-fastify-runtime.js"),
  "express-fastify-runtime-fast": join(__dirname, "express-fastify-runtime-fast.js"),
};

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
  console.log("  " + fmtSample(await sample({ url: `http://127.0.0.1:${port}/` })));
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
  console.log("Middleware Stack Benchmark (Helmet, Morgan, BodyParser, Custom) — %s\n", SETTINGS);

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
