/**
 * Fast smoke test for every benchmark suite.
 * Runs each run.js with DURATION=1 and MW=1 (or 0) so the full set finishes in ~1–2 min.
 * CommonJS so Node does not emit MODULE_TYPELESS_PACKAGE_JSON.
 */

const { spawn } = require("node:child_process");
const { join } = require("node:path");

const rootDir = join(__dirname, "../..");

const DURATION = "1";
const MW = "1";

const suites = [
  "benchmarks/servers/run.js",
  "benchmarks/server-routes/run.js",
  "benchmarks/middleware-stack/run.js",
  "benchmarks/auth/run.js",
  "benchmarks/crud-todo/run.js",
  "benchmarks/payloads/run.js",
  "benchmarks/json-db-test/run.js",
  "benchmarks/uploads/run.js",
  "benchmarks/low-db-test/run.js",
];

function runSuite(scriptPath) {
  return new Promise((resolve, reject) => {
    console.log(`\n>>> [fast] ${scriptPath} (DURATION=${DURATION}, MW=${MW}) ...`);

    const child = spawn(process.execPath, [scriptPath], {
      stdio: "inherit",
      cwd: rootDir,
      env: {
        ...process.env,
        BENCH_AUTO_CLOSE: "1",
        DURATION,
        MW,
      },
    });

    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptPath} exited with code ${code}`));
    });

    child.on("error", reject);
  });
}

async function main() {
  console.log("==========================================");
  console.log("    BENCHMARK SMOKE TEST (DURATION=1s each)");
  console.log("==========================================");

  const start = Date.now();
  let failed = 0;

  for (const suite of suites) {
    try {
      await runSuite(suite);
    } catch (err) {
      console.error("FAILED:", err.message);
      failed++;
    }
  }

  const duration = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n\nSmoke test done in ${duration}s. Failed: ${failed}/${suites.length}.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
