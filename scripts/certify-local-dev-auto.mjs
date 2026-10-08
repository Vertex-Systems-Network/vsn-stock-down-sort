import { spawn, spawnSync } from "node:child_process";
import process from "node:process";
import https from "node:https";

const port = 3458;
const healthUrl = `https://localhost:${port}/healthz`;
const startupTimeoutMs = 180_000;

function probeHealth() {
  return new Promise((resolve) => {
    const request = https.get(
      healthUrl,
      { rejectUnauthorized: false, timeout: 3000 },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () => {
          try {
            const payload = JSON.parse(body);
            resolve(
              response.statusCode === 200 &&
                payload?.ok === true &&
                payload?.environment === "development" &&
                payload?.billingTestMode === true &&
                payload?.database === "sqlite",
            );
          } catch {
            resolve(false);
          }
        });
      },
    );
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(false));
  });
}

function runCertification() {
  const result = spawnSync(
    process.execPath,
    ["scripts/certify-local-dev.mjs", healthUrl],
    { stdio: "inherit", env: process.env },
  );
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}

async function main() {
  console.log(`[local-certification] starting Shopify Dev on localhost:${port}`);
  console.log("[local-certification] complete any Shopify login prompt if it appears");

  const dev = spawn(
    "npm",
    ["run", "dev", "--", "--use-localhost", "--localhost-port", String(port)],
    { stdio: "inherit", env: process.env, shell: process.platform === "win32" },
  );
  let devExit;
  dev.once("exit", (code, signal) => {
    devExit = { code, signal };
  });

  const deadline = Date.now() + startupTimeoutMs;
  while (Date.now() < deadline) {
    if (devExit) {
      throw new Error(
        `Shopify Dev stopped before health was ready (code=${devExit.code}, signal=${devExit.signal ?? "none"}).`,
      );
    }
    if (await probeHealth()) {
      console.log("[local-certification] health checks passed; certifying current source");
      runCertification();
      console.log("[local-certification] Shopify Dev remains running; press Ctrl+C when finished.");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error(
    `Shopify Dev did not expose a healthy Local SQLite endpoint within ${startupTimeoutMs / 1000}s. Check the Dev output above for login, network, or port errors.`,
  );
}

main().catch((error) => {
  console.error(`[local-certification] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
