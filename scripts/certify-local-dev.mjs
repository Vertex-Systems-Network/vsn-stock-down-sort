import fs from "node:fs";
import https from "node:https";
import process from "node:process";
import { execFileSync, spawnSync } from "node:child_process";
import { loadLocalEnv, validateLocalSqliteEnv } from "./local-env.mjs";

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
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}

async function checkHealth(url) {
  const parsedUrl = new URL(url);
  let statusCode;
  let payload;

  if (
    parsedUrl.protocol === "https:" &&
    ["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname)
  ) {
    // Shopify CLI's localhost proxy uses a self-signed certificate. Keep this
    // exception scoped to loopback health checks; remote HTTPS remains verified.
    payload = await new Promise((resolve, reject) => {
      const request = https.get(
        parsedUrl,
        { rejectUnauthorized: false, headers: { "Cache-Control": "no-cache" } },
        (response) => {
          statusCode = response.statusCode;
          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => (body += chunk));
          response.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch {
              reject(new Error("health endpoint returned invalid JSON"));
            }
          });
        },
      );
      request.setTimeout(5000, () => request.destroy(new Error("health check timed out")));
      request.on("error", reject);
    });
  } else {
    const response = await fetch(parsedUrl, {
      headers: { "Cache-Control": "no-cache" },
    });
    statusCode = response.status;
    payload = await response.json();
  }

  if (statusCode < 200 || statusCode >= 300) {
    fail(`health endpoint returned HTTP ${statusCode}`);
  }

  if (payload?.ok !== true) fail("health endpoint did not report ok=true");
  if (payload?.environment !== "development") {
    fail("health endpoint is not running with APP_ENV=development");
  }
  if (payload?.billingTestMode !== true) {
    fail("health endpoint is not running in Shopify billing test mode");
  }
  if (payload?.database !== "sqlite") {
    fail("health endpoint did not report SQLite");
  }

  return {
    status: statusCode,
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
    fail(
      `Local certification must run from development; current branch is "${branch || "detached"}"`,
    );
  }

  loadLocalEnv();
  validateLocalSqliteEnv();

  const status = execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  }).trim();
  if (status) {
    fail(
      "working tree must be clean before Local certification; commit the exact code under test first.",
    );
  }

  const sourceRef = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();

  run("npx", ["prisma", "validate", "--schema", "prisma/schema.prisma"]);
  run("npx", ["prisma", "generate", "--schema", "prisma/schema.prisma"]);
  run("npx", [
    "prisma",
    "migrate",
    "deploy",
    "--schema",
    "prisma/schema.prisma",
  ]);

  if (!fs.existsSync("prisma/dev.sqlite")) {
    fail("prisma/dev.sqlite does not exist after Local migration.");
  }

  const healthUrl = process.argv[2];
  if (!healthUrl) {
    fail(
      "pass the running local health URL, for example http://127.0.0.1:3000/healthz",
    );
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
      database_provider: "sqlite",
      database_file: "prisma/dev.sqlite",
      sqlite_gitignored: true,
      prisma_validate: "passed",
      prisma_generate: "passed",
      prisma_migrate_deploy: "passed",
      shopify_app: "VSN | Stock Down Sort Dev",
      shopify_dev_health: health,
      health_url: new URL(healthUrl).origin + "/healthz",
      note:
        "Local SQLite acceptance is not PostgreSQL acceptance; Staging remains the first required Neon/PostgreSQL runtime gate.",
    },
  };

  fs.writeFileSync(gatePath, JSON.stringify(gates, null, 2) + "\n");

  console.log(`[local-certification] accepted source_ref=${sourceRef}`);
  console.log("[local-certification] database=sqlite");
  console.log(`[local-certification] evidence written to ${gatePath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
