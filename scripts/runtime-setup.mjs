import { spawnSync } from "node:child_process";

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const configuredAppEnv = process.env.APP_ENV?.trim();

if (!configuredAppEnv && process.env.NODE_ENV === "production") {
  console.error("[runtime-setup] APP_ENV is required for hosted runtimes.");
  process.exit(1);
}

const appEnv = String(configuredAppEnv || "development").toLowerCase();
const schema = "prisma/cloud/schema.prisma";

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
    npxCommand,
    ["prisma", ...args, "--schema", schema],
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

for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
  if (!process.env[name]) {
    fail(`${name} is required for ${appEnv}.`);
  }
}

const billingTestMode = boolEnv("SHOPIFY_BILLING_TEST_MODE");

if (appEnv !== "production" && billingTestMode !== true) {
  fail(`${appEnv} must use SHOPIFY_BILLING_TEST_MODE=true.`);
}

if (appEnv === "production" && billingTestMode !== false) {
  fail("Production must use SHOPIFY_BILLING_TEST_MODE=false.");
}

console.log(
  `[runtime-setup] environment=${appEnv} database=postgresql prisma=engine-less`,
);

runPrisma(["generate"]);
runPrisma(["migrate", "deploy"]);
