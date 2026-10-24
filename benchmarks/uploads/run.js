const { spawn } = require("node:child_process");
const net = require("node:net");
const { join } = require("node:path");
const { sample, fmtSample, waitForPort, COOLDOWN, SETTINGS } = require("../lib/bench");
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
  const url = `http://127.0.0.1:${port}/upload`;
  // Sanity-check ONE real upload before measuring. req/s alone is meaningless if the server is
  // rejecting every request — a 415 (Fastify has no multipart parser) used to "pass" this benchmark
  // at ~1.4k req/s while uploading nothing.
  const probe = await fetch(url, { method: "POST", body: bodyObj.body, headers: bodyObj.headers });
  if (!probe.ok) {
    console.log(`  ${label} -> BROKEN: server answered ${probe.status} (${(await probe.text()).slice(0, 80)})`);
    return;
  }
  const s = await sample({
    url,
    method: "POST",
    body: bodyObj.body,
    headers: bodyObj.headers,
    pipelining: 1, // never pipeline large multipart bodies
  });
  console.log(`  ${label} -> ` + fmtSample(s));
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
    await new Promise((r) => setTimeout(r, COOLDOWN));
  }
}

async function main() {
  console.log("Uploads Benchmark (Multipart POST) — %s\n", SETTINGS);

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
