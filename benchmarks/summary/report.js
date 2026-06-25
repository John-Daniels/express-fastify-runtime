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
  console.log("==========================================");
  console.log("    RUNNING COMPLETE BENCHMARK SUITE");
  console.log("==========================================");

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
