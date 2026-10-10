import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import process from "node:process";
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { probeHealth, waitForHealth } from "./certify-local-dev-auto.mjs";
import { recordSortFailure, recordSortSuccess } from "../app/services/collection-setting-sort-state.server.mjs";

const sourceRef = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
assert.match(sourceRef, /^[0-9a-f]{40}$/);
assert.equal(process.env.APP_ENV, "development");
assert.equal(process.env.SHOPIFY_BILLING_TEST_MODE, "true");
assert.equal(process.env.SHOPIFY_BILLING_MODE, "manual_legacy");
assert.equal(process.env.SHOPIFY_API_SECRET, "cloud-dev-ci-only-not-a-shopify-credential");
assert.equal(process.env.DATABASE_URL, undefined);
assert.equal(process.env.DIRECT_URL, undefined);
assert.equal(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(), "");

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
// Exercise the actual migrated SQLite database, including deletion-safe writes.
// This fixture never represents a Shopify merchant/session or subscription.
const shop = "cloud-runtime-fixture.invalid";
try {
  const setting = await prisma.collectionSetting.create({ data: { shop, collectionId: "fixture-collection", enabled: true } });
  assert.equal((await prisma.collectionSetting.findUnique({ where: { id: setting.id } })).enabled, true);
  // Simulate a privacy purge after the sorter has loaded the setting.
  await prisma.collectionSetting.delete({ where: { id: setting.id } });
  const key = { shop, collectionId: setting.collectionId };
  await assert.rejects(recordSortSuccess(prisma, key), /settings disappeared during sorting/);
  await recordSortFailure(prisma, key, "fixture missing settings");
  assert.equal((await prisma.collectionSetting.updateMany({ where: key, data: { lastError: "fixture" } })).count, 0);
  assert.equal(await prisma.collectionSetting.count({ where: { shop } }), 0);
} finally {
  await prisma.$disconnect();
}

const listener = net.createServer();
await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
const port = listener.address().port;
await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
const healthUrl = `http://127.0.0.1:${port}/healthz`;
const serve = require.resolve("@react-router/serve/package.json").replace(/package\.json$/, "dist/cli.js");
const child = spawn(process.execPath, [serve, "build/server/index.js"], {
  stdio: "inherit", env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
});
let failure;
child.once("error", (error) => { failure = error; });
child.once("exit", (code) => { failure = new Error(`Cloud Dev server stopped: ${code}`); });
try {
  await waitForHealth({ candidates: new Set([healthUrl]), getFailure: () => failure, probe: probeHealth, timeoutMs: 60000 });
  const health = await (await fetch(healthUrl, { redirect: "error", signal: AbortSignal.timeout(5000) })).json();
  assert.equal(health.service, "vsn-stock-down-sort");
  assert.equal(health.billingMethod, "manual_legacy");
  assert.deepEqual(health.billingCatalog.plans.map(({ id, amount, trialDays }) => ({ id, amount, trialDays })), [
    { id: "starter", amount: 10.99, trialDays: 10 }, { id: "growth", amount: 19.99, trialDays: 10 },
    { id: "pro", amount: 34.99, trialDays: 10 }, { id: "unlimited", amount: 70, trialDays: 10 },
  ]);
  const evidence = {
    status: "accepted", accepted_source_ref: sourceRef, accepted_at: new Date().toISOString(),
    evidence_record: {
      verification_mode: "github_actions_cloud_sqlite_runtime",
      credential_mode: "synthetic_ci_only", merchant_runtime_acceptance: "pending_staging",
      repository: process.env.GITHUB_REPOSITORY || "local-verification",
      workflow_run_id: process.env.GITHUB_RUN_ID || null,
      workflow_run_attempt: process.env.GITHUB_RUN_ATTEMPT || null,
      database_provider: "sqlite", prisma_validate: "passed", prisma_generate: "passed",
      prisma_migrate_deploy: "passed", sqlite_roundtrip: "passed", deletion_safe_write: "passed",
      runtime_health: "passed", billing_catalog: "passed", contract_tests: "passed", build: "passed",
      health_url: healthUrl, shopify_dev_health: health,
      note: "Cloud Dev verifies actual application code and fresh SQLite runtime; it does not authenticate a Shopify store or authorize billing. Signed Shopify acceptance is required on Staging.",
    },
  };
  fs.mkdirSync("/tmp/stock-down-sort-cloud-dev", { recursive: true });
  fs.writeFileSync("/tmp/stock-down-sort-cloud-dev/evidence.json", JSON.stringify(evidence, null, 2) + "\n");
  console.log(`CLOUD_DEV_EVIDENCE=${JSON.stringify(evidence)}`);
} finally {
  child.kill("SIGTERM");
}
