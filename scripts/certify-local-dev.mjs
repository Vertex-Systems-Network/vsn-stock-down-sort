import fs from "node:fs";
import process from "node:process";
import { execFileSync, spawnSync } from "node:child_process";
import { loadLocalEnv, validateLocalNeonEnv } from "./local-env.mjs";

function fail(message) {
  throw new Error(`[local-certification] ${message}`);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });

  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function checkHealth(url) {
  const response = await fetch(url, {
    headers: { "Cache-Control": "no-cache" },
  });

  if (!response.ok) {
    fail(`health endpoint returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload?.ok !== true) fail("health endpoint did not report ok=true");
  if (payload?.environment !== "development") {
    fail("health endpoint is not running with APP_ENV=development");
  }
  if (payload?.billingTestMode !== true) {
    fail("health endpoint is not running in Shopify billing test mode");
  }
  if (payload?.database !== "postgresql") {
    fail("health endpoint did not report PostgreSQL");
  }

  return {
    status: response.status,
    environment: payload.environment,
    billingTestMode: payload.billingTestMode,
    database: payload.database,
  };
}

async function main() {
  const branch = execFileSync("git", ["branch", "--show-current"], {
    encoding: "utf8",
  }).trim();
  if (branch !== "development") {
    fail(`Local certification must run from development; current branch is "${branch || "detached"}"`);
  }

  loadLocalEnv();
  validateLocalNeonEnv();

  const status = execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  }).trim();
  if (status) {
    fail("working tree must be clean before Local certification; commit the exact code under test first.");
  }

  const sourceRef = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();

  run("npx", [
    "prisma",
    "migrate",
    "deploy",
    "--schema",
    "prisma/cloud/schema.prisma",
  ]);

  const healthUrl = process.argv[2];
  if (!healthUrl) {
    fail("pass the running local health URL, for example http://127.0.0.1:3000/healthz");
  }

  const health = await checkHealth(healthUrl);

  const gatePath = "config/release/environment-gates.json";
  const gates = JSON.parse(fs.readFileSync(gatePath, "utf8"));

  gates.local_dev = {
    status: "accepted",
    accepted_source_ref: sourceRef,
    accepted_at: new Date().toISOString(),
    evidence_record: {
      branch,
      neon_environment: "development",
      local_neon_validation: "passed",
      prisma_migrate_deploy: "passed",
      shopify_dev_health: health,
      health_url: new URL(healthUrl).origin + "/healthz",
    },
  };

  fs.writeFileSync(gatePath, JSON.stringify(gates, null, 2) + "\n");

  console.log(`[local-certification] accepted source_ref=${sourceRef}`);
  console.log(`[local-certification] evidence written to ${gatePath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
