import { spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const appEnv = String(
  process.env.APP_ENV || (process.env.NODE_ENV === "production" ? "production" : "development"),
).toLowerCase();

const cloudEnvironment = appEnv === "staging" || appEnv === "production";
const schema = cloudEnvironment
  ? "prisma/cloud/schema.prisma"
  : "prisma/schema.prisma";

function fail(message) {
  console.error(`[runtime-setup] ${message}`);
  process.exit(1);
}

function boolEnv(name) {
  const value = String(process.env[name] || "").trim().toLowerCase();

  if (["true", "1", "yes"].includes(value)) return true;
  if (["false", "0", "no"].includes(value)) return false;

  return undefined;
}

function runPrisma(args) {
  const result = spawnSync(
    npmCommand,
    ["exec", "prisma", "--", ...args, "--schema", schema],
    {
      stdio: "inherit",
      env: process.env,
    },
  );

  if (result.status !== 0) {
    fail(`Prisma command failed: prisma ${args.join(" ")}`);
  }
}

if (!["development", "staging", "production"].includes(appEnv)) {
  fail(`Unsupported APP_ENV: ${appEnv}`);
}

if (cloudEnvironment) {
  for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
    if (!process.env[name]) {
      fail(`${name} is required for ${appEnv}.`);
    }
  }
}

const billingTestMode = boolEnv("SHOPIFY_BILLING_TEST_MODE");

if (appEnv === "staging" && billingTestMode !== true) {
  fail("Staging must use SHOPIFY_BILLING_TEST_MODE=true.");
}

if (appEnv === "production" && billingTestMode !== false) {
  fail("Production must use SHOPIFY_BILLING_TEST_MODE=false.");
}

console.log(
  `[runtime-setup] environment=${appEnv} database=${cloudEnvironment ? "postgresql" : "sqlite"}`,
);

runPrisma(["generate"]);
runPrisma(["migrate", "deploy"]);
