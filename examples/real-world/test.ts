import { spawn } from "child_process";
import { join } from "path";

const PORT = 3000;
const SERVER_FILE = join(process.cwd(), "examples/real-world/index.ts");

async function test() {
  console.log("Starting server...");
  const server = spawn("npx", ["tsx", SERVER_FILE], {
    stdio: "pipe",
    env: { ...process.env, PORT: String(PORT) },
  });

  server.stdout.on("data", (data) => console.log(`[Server]: ${data}`));
  server.stderr.on("data", (data) => console.error(`[Server Error]: ${data}`));

  // Wait for server to start with retry logic
  const maxRetries = 20;
  let serverReady = false;

  for (let i = 0; i < maxRetries; i++) {
    try {
      await fetch(`http://localhost:${PORT}/`);
      serverReady = true;
      console.log("Server is ready!");
      break;
    } catch (e) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  if (!serverReady) {
    console.error("Server failed to start in time.");
    // Force kill if needed
    server.kill();
    process.exit(1);
  }

  try {
    console.log("Testing GET / (Fastify Lane)...");
    const resRoot = await fetch(`http://localhost:${PORT}/`);
    console.log(`Root status: ${resRoot.status}`);
    const rootBody = await resRoot.json();
    console.log("Root body:", rootBody);

    if (resRoot.status !== 200) throw new Error("Root route failed");

    console.log("Testing GET /api/users (Express Lane via Router)...");
    const resUsers = await fetch(`http://localhost:${PORT}/api/users`);
    console.log(`Users status: ${resUsers.status}`);
    const usersBody = await resUsers.json();
    console.log("Users body:", JSON.stringify(usersBody, null, 2));

    if (resUsers.status !== 200 || !Array.isArray(usersBody))
      throw new Error("Users route failed");
    console.log("SUCCESS: All tests passed!");
  } catch (err) {
    console.error("TEST FAILED:", err);
    process.exitCode = 1;
  } finally {
    console.log("Stopping server...");
    server.kill();
  }
}

test();
