const { spawn } = require("node:child_process");
const net = require("node:net");
const { join } = require("node:path");
const crypto = require("node:crypto");

const rootDir = join(__dirname, "../..");

const BASE_PORT = Number(process.env.PORT) || 3001;
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

function generateMultipartBody(sizeBytes) {
  const boundary = "--------------------------1234567890";
  const data = crypto.randomBytes(sizeBytes);

  const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`;
  const footer = `\r\n--${boundary}--`;

  const body = Buffer.concat([Buffer.from(header), data, Buffer.from(footer)]);

  return {
    body,
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

async function runAutocannon(port, label, bodyObj) {
  let autocannon;
  try {
    const mod = await import("autocannon");
    autocannon = mod.default;
  } catch (_) {
    console.log("  (install: npm i -D autocannon)");
    return;
  }

  const result = await autocannon({
    url: `http://127.0.0.1:${port}/upload`,
    method: "POST",
    body: bodyObj.body,
    headers: bodyObj.headers,
    duration: Number(DURATION),
    connections: 10,
    pipelining: 1, // Pipelining might break uploads if not careful
  });
  const avg = result.requests?.average ?? 0;
  const mean = result.latency?.mean ?? 0;
  console.log(
    `  ${label} -> req/s:`,
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
    env: { ...process.env, PORT: String(port), BENCH_AUTO_CLOSE: "1" },
    cwd: rootDir,
  });
  try {
    await waitForPort(port);

    // Bench sizes
    await runAutocannon(port, "1MB", generateMultipartBody(1024 * 1024));
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function main() {
  console.log("Uploads Benchmark (Multipart POST, duration=%ss)\n", DURATION);

  for (const name of targets) {
    process.stdout.write(name + ":\n");
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
