import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const flow = JSON.parse(fs.readFileSync("config/development-flow.json", "utf8"));
const gates = JSON.parse(fs.readFileSync("config/release/environment-gates.json", "utf8"));
const productionRelease = JSON.parse(fs.readFileSync("config/shopify/production-release.json", "utf8"));
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const developmentFlow = JSON.parse(fs.readFileSync("config/development-flow.json", "utf8"));

const read = (path) => fs.readFileSync(path, "utf8");

test("environment promotion order is Local/Dev -> Staging -> Live", () => {
  assert.deepEqual(flow.promotion_policy.order, ["local_dev", "staging", "live"]);
  assert.equal(flow.development_branch, "development");
  assert.equal(flow.release_branch, "main");
  assert.equal(flow.promotion_policy.staging.source_branch, "development");
  assert.equal(flow.promotion_policy.live.source_branch, "main");
  assert.equal(flow.promotion_policy.evidence_record, "config/release/environment-gates.json");
  assert.equal(flow.invariants.staging_requires_local_dev_acceptance_record, true);
  assert.equal(flow.invariants.live_requires_staging_acceptance_record_on_main, true);
});

test("staging deployment requires a Local/Dev-accepted exact source", () => {
  const workflow = read(".github/workflows/cloudflare-staging-deploy.yml");
  assert.match(workflow, /source_ref:/);
  assert.match(workflow, /environment-gates\.json/);
  assert.match(workflow, /local\.get\("status"\)!="accepted"/);
  assert.match(workflow, /git checkout --detach "\$SOURCE_REF"/);
  assert.doesNotMatch(workflow, /ref: main/);
});

test("Shopify staging candidate/release remain development-derived", () => {
  const candidate = read(".github/workflows/shopify-staging-version.yml");
  const release = read(".github/workflows/shopify-staging-release.yml");
  assert.match(candidate, /ref: development/);
  assert.match(candidate, /accepted_source_ref/);
  assert.match(candidate, /SOURCE_PREFIX="\$\{SOURCE_REF:0:12\}"/);
  assert.match(release, /ref: development/);
  assert.match(release, /SOURCE_REF/);
  assert.match(release, /TARGET_VERSION.*SOURCE_REF/);
  assert.doesNotMatch(release, /ref: main/);
});

test("staging readiness is development-derived and source-bound", () => {
  const workflow = read(".github/workflows/staging-readiness.yml");
  assert.match(workflow, /ref: development/);
  assert.match(workflow, /source_ref:/);
  assert.match(workflow, /accepted_source_ref/);
});

test("all production operations require staging acceptance recorded on main", () => {
  const paths = [
    ".github/workflows/cloudflare-production-prepare.yml",
    ".github/workflows/shopify-production-candidate.yml",
    ".github/workflows/shopify-production-release.yml",
    ".github/workflows/production-readiness.yml",
  ];
  for (const path of paths) {
    const workflow = read(path);
    assert.match(workflow, /ref: main/);
    assert.match(workflow, /origin\/main:config\/release\/environment-gates\.json/);
    assert.match(workflow, /staging\.get\("status"\)!="accepted"/);
  }
});

test("production readiness is explicitly pinned to main", () => {
  const workflow = read(".github/workflows/production-readiness.yml");
  assert.match(workflow, /ref: main/);
});

test("main branch merge protection contract is explicit", () => {
  assert.equal(developmentFlow.main_branch_protection.ruleset_name, "main");
  assert.equal(developmentFlow.main_branch_protection.enforcement, "active");
  assert.equal(developmentFlow.main_branch_protection.pull_request_required, true);
  assert.equal(developmentFlow.main_branch_protection.required_status_check, "validate");
  assert.equal(developmentFlow.main_branch_protection.required_status_check_display, "App Validation / validate");
  assert.equal(developmentFlow.main_branch_protection.required_status_check_enforced, true);
  assert.equal(developmentFlow.main_branch_protection.bypass, "never");
});

test("Local/Dev entrypoint enforces Neon environment validation", () => {
  assert.equal(packageJson.scripts.predev, "node scripts/local-dev-runner.mjs predev");
  assert.equal(packageJson.scripts["local:validate"], "node scripts/validate-local-neon-env.mjs");
  assert.equal(packageJson.scripts["local:certify"], "node scripts/certify-local-dev.mjs");
  const runner = read("scripts/local-dev-runner.mjs");
  assert.match(runner, /validateLocalNeonEnv\(\)/);
  assert.match(runner, /branch !== "development"/);
  assert.match(runner, /npm run dev is restricted to development/);
  assert.match(runner, /prisma/);
  const certifier = read("scripts/certify-local-dev.mjs");
  assert.match(certifier, /branch !== "development"/);
  assert.match(certifier, /prisma/);
  assert.match(certifier, /health endpoint did not report ok=true/);
  assert.match(certifier, /gates\.local_dev/);
  assert.match(certifier, /git\", \["status", "--porcelain"\]/);
  assert.match(certifier, /working tree must be clean/);
  const localEnv = read("scripts/local-env.mjs");
  assert.match(localEnv, /validateLocalShopifyConfig/);
  assert.match(localEnv, /VSN \| Stock Down Sort Dev/);
  assert.match(localEnv, /675de0e3834ce61a75473de19df457c4/);
});

test("production release policy references the staging acceptance gate", () => {
  assert.deepEqual(productionRelease.governance.promotion_order, ["local_dev", "staging", "live"]);
  assert.equal(productionRelease.governance.staging_acceptance_required, true);
  assert.equal(productionRelease.governance.staging_acceptance_record, "config/release/environment-gates.json");
  assert.equal(productionRelease.governance.staging_acceptance_authoritative_branch, "main");
  assert.equal(productionRelease.governance.live_source_branch, "main");
});

test("initial gate state cannot accidentally authorize promotion", () => {
  assert.equal(gates.local_dev.status, "verification_required");
  assert.equal(gates.staging.status, "blocked");
  assert.equal(gates.live.status, "blocked");
  assert.equal(gates.local_dev.accepted_source_ref, null);
  assert.equal(gates.staging.accepted_source_ref, null);
  assert.equal(gates.live.authorized_source_ref, null);
});
