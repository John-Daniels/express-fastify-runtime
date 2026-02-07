import { spawn } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "../..");

const BASE_PORT = Number(process.env.PORT) || 3001;
const MW = process.env.MW || "0";
const DURATION = process.env.DURATION || "5";

const targets = [];
if (process.argv.includes("--express")) targets.push("express");
if (process.argv.includes("--fastify")) targets.push("fastify");
if (process.argv.includes("--runtime")) targets.push("express-fastify-runtime");
if (targets.length === 0) {
  targets.push("express", "fastify", "express-fastify-runtime");
}

const ports = {
  express: BASE_PORT,
  fastify: BASE_PORT + 1,
  "express-fastify-runtime": BASE_PORT + 3,
};

const serverFiles = {
  express: join(__dirname, "express.js"),
  fastify: join(__dirname, "fastify.js"),
  "express-fastify-runtime": join(__dirname, "express-fastify-runtime.js"),
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
  const autocannon = await import("autocannon").catch(() => null);
  if (!autocannon) {
    console.log("  (install: npm i -D autocannon)");
    return;
  }
  // Read + Write simulation (POST /todos)
  const result = await autocannon.default({
    url: `http://127.0.0.1:${port}/todos`,
    method: "POST",
    body: JSON.stringify({ task: "Benchmark task", done: false }),
    headers: { "content-type": "application/json" },
    duration: Number(DURATION),
    connections: 10,
    pipelining: 1,
  });
  const avg = result.requests?.average ?? 0;
  const mean = result.latency?.mean ?? 0;
  console.log(
    "  req/s:",
    avg.toFixed(0),
    "| latency mean:",
    mean.toFixed(2),
    "ms",
  );
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
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function main() {
  console.log(
    "LowDB-like Benchmark (IO heavy POST /todos, duration=%ss)\n",
    DURATION,
  );

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
