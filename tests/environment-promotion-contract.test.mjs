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

test("staging readiness validates the current four-plan billing catalog", () => {
  const workflow = read(".github/workflows/staging-readiness.yml");

  assert.match(workflow, /config\/ai\/product-plan\.json/);
  assert.match(workflow, /\{"id": "starter", "amount": 10\.99, "trial_days": 10\}/);
  assert.match(workflow, /\{"id": "growth", "amount": 19\.99, "trial_days": 10\}/);
  assert.match(workflow, /\{"id": "pro", "amount": 34\.99, "trial_days": 10\}/);
  assert.match(workflow, /\{"id": "unlimited", "amount": 54\.99, "trial_days": 10\}/);
  assert.match(workflow, /billing_interval"\) != "EVERY_30_DAYS"/);
  assert.match(workflow, /catalog trial_days must be 10/);
  assert.match(workflow, /staging_billing_contract=four_plans_10_day_trials/);
  assert.doesNotMatch(workflow, /5_days_usd_55/);
  assert.doesNotMatch(workflow, /trialDays:\[\[:space:\]\]\*5/);
});

test("staging Shopify workflows reject both Local and Production client identities", () => {
  const paths = [
    ".github/workflows/environment-secrets-audit.yml",
    ".github/workflows/staging-readiness.yml",
    ".github/workflows/cloudflare-staging-deploy.yml",
    ".github/workflows/shopify-staging-version.yml",
    ".github/workflows/shopify-staging-release.yml",
  ];

  for (const path of paths) {
    const workflow = read(path);

    assert.match(workflow, /LOCAL_CLIENT_ID/);
    assert.match(workflow, /PRODUCTION_CLIENT_ID/);
    assert.match(workflow, /shopify\.app\.production\.toml/);
    assert.match(
      workflow,
      /SHOPIFY_API_KEY" = "\$PRODUCTION_CLIENT_ID"/,
    );
  }

  const audit = read(".github/workflows/environment-secrets-audit.yml");
  assert.match(
    audit,
    /SHOPIFY_API_KEY matches the Production Shopify client ID/,
  );
  assert.match(
    audit,
    /Shopify identity isolated from Local\/Dev and Production: \*\*yes\*\*/,
  );
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
  assert.equal(developmentFlow.local.shopify_config, "shopify.app.local.toml");
  assert.equal(developmentFlow.local.cli_config_alias, "local");
  assert.equal(developmentFlow.local.branch_policy, "development_only");
  assert.equal(developmentFlow.invariants.local_shopify_identity_must_match_committed_local_config, true);
  assert.equal(developmentFlow.main_branch_protection.ruleset_name, "main");
  assert.equal(developmentFlow.main_branch_protection.enforcement, "active");
  assert.equal(developmentFlow.main_branch_protection.pull_request_required, true);
  assert.equal(developmentFlow.main_branch_protection.required_status_check, "validate");
  assert.equal(developmentFlow.main_branch_protection.required_status_check_display, "App Validation / validate");
  assert.equal(developmentFlow.main_branch_protection.required_status_check_enforced, true);
  assert.equal(developmentFlow.main_branch_protection.bypass, "never");
});

test("Local/Dev entrypoint enforces SQLite environment validation", () => {
  assert.equal(packageJson.scripts.predev, "node scripts/local-dev-runner.mjs predev");
  assert.equal(packageJson.scripts["local:validate"], "node scripts/validate-local-sqlite-env.mjs");
  assert.equal(packageJson.scripts["local:certify"], "node scripts/certify-local-dev.mjs");
  assert.match(packageJson.scripts.dev, /--config local/);
  const runner = read("scripts/local-dev-runner.mjs");
  assert.match(runner, /validateLocalSqliteEnv\(\)/);
  assert.match(runner, /branch !== "development"/);
  assert.match(runner, /npm run dev is restricted to development/);
  assert.match(runner, /prisma\/schema\.prisma/);
  assert.doesNotMatch(runner, /prisma\/cloud\/schema\.prisma/);
  const certifier = read("scripts/certify-local-dev.mjs");
  assert.match(certifier, /branch !== "development"/);
  assert.match(certifier, /prisma\/schema\.prisma/);
  assert.match(certifier, /database_provider: "sqlite"/);
  assert.match(certifier, /health endpoint did not report ok=true/);
  assert.match(certifier, /gates\.local_dev/);
  assert.match(certifier, /git\", \["status", "--porcelain"\]/);
  assert.match(certifier, /working tree must be clean/);
  const localConfig = read("shopify.app.local.toml");
  assert.match(localConfig, /name\s*=\s*"VSN \| Stock Down Sort Dev"/);
  assert.match(localConfig, /client_id\s*=\s*"675de0e3834ce61a75473de19df457c4"/);
  const localEnv = read("scripts/local-env.mjs");
  assert.match(localEnv, /validateLocalShopifyConfig/);
  assert.match(localEnv, /shopify\.app\.local\.toml/);
  assert.match(localEnv, /VSN \| Stock Down Sort Dev/);
  assert.match(localEnv, /675de0e3834ce61a75473de19df457c4/);
  assert.match(localEnv, /validateLocalShopifyEnv/);
  assert.match(localEnv, /validateLocalSqliteSchema/);
  assert.match(localEnv, /hosted database/i);
});

test("production release policy references the staging acceptance gate", () => {
  assert.deepEqual(productionRelease.governance.promotion_order, ["local_dev", "staging", "live"]);
  assert.equal(productionRelease.governance.staging_acceptance_required, true);
  assert.equal(productionRelease.governance.staging_acceptance_record, "config/release/environment-gates.json");
  assert.equal(productionRelease.governance.staging_acceptance_authoritative_branch, "main");
  assert.equal(productionRelease.governance.live_source_branch, "main");
});

test("signed Staging acceptance still cannot authorize Live until recorded on main", () => {
  assert.equal(gates.local_dev.status, "accepted");
  assert.equal(
    gates.local_dev.accepted_source_ref,
    "ca5851561ab7979712f11580ab951fda4650ef19",
  );
  assert.equal(gates.staging.status, "accepted");
  assert.equal(
    gates.staging.deployed_source_ref,
    "ca5851561ab7979712f11580ab951fda4650ef19",
  );
  assert.equal(
    gates.staging.accepted_source_ref,
    "ca5851561ab7979712f11580ab951fda4650ef19",
  );
  assert.equal(
    gates.staging.accepted_main_ref,
    "8bff7a1ecb8adca7592997fc74ffe10837e4ae2d",
  );
  assert.equal(gates.staging.evidence_record?.run_id, 36989726911);
  assert.equal(gates.staging.evidence_record?.recognized_plan_id, "starter");
  assert.equal(gates.live.status, "blocked");
  assert.equal(
    gates.live.authorized_source_ref,
    "516ab92a2d1a4a74fc9624dfc56d3fcc3f624182",
  );
  assert.equal(
    gates.live.authorization_record?.version,
    "stock-down-sort-production-516ab92a2d1a-1",
  );
  assert.equal(gates.live.authorization_record?.candidate_status, "unreleased");
});

test("production readiness validates the canonical four-plan billing contract", () => {
  const workflow = read(".github/workflows/production-readiness.yml");
  assert.match(workflow, /config\/ai\/product-plan\.json/);
  assert.match(workflow, /production_billing_contract=four_plans_10_day_trials/);
  assert.doesNotMatch(workflow, /production_billing_contract=5_days_usd_55/);
  assert.doesNotMatch(workflow, /trialDays:\[\[:space:\]\]\*5/);
});

test("production release is pinned to the exact authorized candidate and verifies the final app name", () => {
  const workflow = read(".github/workflows/shopify-production-release.yml");
  assert.equal(productionRelease.status, "authorized_pending_release");
  assert.equal(productionRelease.release_authorized, true);
  assert.equal(
    productionRelease.authorized_version,
    "stock-down-sort-production-516ab92a2d1a-1",
  );
  assert.equal(
    productionRelease.authorized_source_ref,
    "516ab92a2d1a4a74fc9624dfc56d3fcc3f624182",
  );
  assert.match(workflow, /Requested version is not the repository-authorized version/);
  assert.match(workflow, /name = "VSN \| Stock Down Sort"/);
  assert.match(workflow, /Verify released Production app name/);
  assert.match(workflow, /app info/);
  assert.match(workflow, /production_shopify_app_name=VSN \| Stock Down Sort/);
});
