/**
 * Run full benchmark suite (all run.js scripts).
 * CommonJS so Node does not emit MODULE_TYPELESS_PACKAGE_JSON when package has no "type": "module".
 */

const { spawn } = require("node:child_process");
const { join } = require("node:path");

const rootDir = join(__dirname, "../..");

const suites = [
  "benchmarks/servers/run.js",
  "benchmarks/server-routes/run.js",
  "benchmarks/middleware-stack/run.js",
  "benchmarks/auth/run.js",
  "benchmarks/crud-todo/run.js",
  "benchmarks/payloads/run.js",
  "benchmarks/json-db-test/run.js",
  // 'benchmarks/uploads/run.js', // Uploads might be flaky in automated summary due to boundary handling/setup, assume user runs manually or uncomment
  "benchmarks/low-db-test/run.js",
];

// Add uploads back
suites.splice(6, 0, "benchmarks/uploads/run.js");

// The full suite is a quick OVERVIEW across ~10 sub-benchmarks, so it uses lighter measurement than
// a single benchmark's defaults (otherwise it runs ~8 min). Still warmed + median. Set these BEFORE
// requiring lib/bench so the printed methodology matches, and children inherit via process.env. For
// quotable numbers, run a single benchmark or the table harness, or override ROUNDS/DURATION.
if (process.env.DURATION === undefined) process.env.DURATION = "2";
if (process.env.ROUNDS === undefined) process.env.ROUNDS = "2";
if (process.env.WARMUP === undefined) process.env.WARMUP = "1";
if (process.env.COOLDOWN === undefined) process.env.COOLDOWN = "400";

function runSuite(scriptPath) {
  return new Promise((resolve, reject) => {
    console.log(`\n>>> Running ${scriptPath} ...`);

    const child = spawn(process.execPath, [scriptPath], {
      stdio: "inherit",
      cwd: rootDir,
      env: { ...process.env, BENCH_AUTO_CLOSE: "1" },
    });

    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Script ${scriptPath} failed with code ${code}`));
    });

    child.on("error", reject);
  });
}

async function main() {
  const { SETTINGS } = require("../lib/bench");
  console.log("==========================================");
  console.log("    RUNNING COMPLETE BENCHMARK SUITE");
  console.log("==========================================");
  console.log(`Methodology: ${SETTINGS}`);
  console.log(
    "Read it right: fast() should be >= Express and ~= express-fastify-runtime (they share the\n" +
      "engine). If fast() diverges far from express-fastify-runtime, the machine is throttling —\n" +
      "rerun on an idle machine. Set PIPELINING=1 for a realistic-load view; >1 = CPU-saturated.\n",
  );

  const start = Date.now();

  for (const suite of suites) {
    try {
      await runSuite(suite);
    } catch (err) {
      console.error("FAILED:", err.message);
    }
  }

  const duration = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n\nAll benchmarks completed in ${duration}s.`);
}

main().catch(console.error);
