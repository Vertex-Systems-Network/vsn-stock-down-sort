import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("Prisma runtime is Worker-compatible and request-scoped", () => {
  const schema = read("prisma/cloud/schema.prisma");
  const db = read("app/db.server.ts");
  const storage = read("app/prisma-session-storage.server.ts");
  const pkg = JSON.parse(read("package.json"));

  assert.match(schema, /engineType\s*=\s*"client"/);
  assert.match(schema, /provider\s*=\s*"postgresql"/);
  assert.match(db, /@prisma\/adapter-pg/);
  assert.match(db, /new PrismaPg\(\{ connectionString \}\)/);
  assert.match(db, /export async function withPrismaClient/);
  assert.doesNotMatch(db, /prismaGlobal|global\./);
  assert.doesNotMatch(db, /export default/);
  assert.match(storage, /RequestScopedPrismaSessionStorage/);
  assert.match(storage, /await prisma\.\$disconnect\(\)/);

  assert.equal(pkg.dependencies["@prisma/client"], "6.19.3");
  assert.equal(pkg.dependencies["@prisma/adapter-pg"], "6.19.3");
  assert.equal(pkg.dependencies.pg, "8.23.0");
  assert.equal(pkg.devDependencies.prisma, "6.19.3");
  assert.equal(pkg.devDependencies["@types/pg"], "8.23.1");
});

test("SSR and Worker entry stay Web-runtime compatible", () => {
  const entry = read("app/entry.server.tsx");
  const worker = read("workers/app.js");

  assert.match(entry, /renderToReadableStream/);
  assert.match(entry, /react-dom\/server\.browser/);
  assert.doesNotMatch(entry, /PassThrough|renderToPipeableStream|@react-router\/node/);

  assert.match(worker, /createRequestHandler/);
  assert.match(worker, /\.\.\/build\/server\/index\.js/);
  assert.match(worker, /async fetch\(request, env, ctx\)/);
  assert.match(worker, /cloudflare:\s*\{\s*env,\s*ctx\s*\}/);
});

test("Wrangler environments are isolated and declare required secrets", () => {
  const staging = JSON.parse(read("wrangler.staging.jsonc"));
  const production = JSON.parse(read("wrangler.production.jsonc"));

  assert.equal(staging.name, "vsn-stock-down-sort-staging");
  assert.equal(production.name, "vsn-stock-down-sort-production");
  assert.equal(staging.main, "./workers/app.js");
  assert.equal(production.main, "./workers/app.js");

  for (const config of [staging, production]) {
    assert.equal(config.assets.directory, "build/client");
    assert.ok(config.compatibility_date >= "2026-08-04");
    assert.ok(config.secrets.required.includes("DATABASE_URL"));
    assert.ok(config.secrets.required.includes("SHOPIFY_API_SECRET"));
    assert.ok(!config.secrets.required.includes("DIRECT_URL"));
  }

  assert.equal(staging.vars.APP_ENV, "staging");
  assert.equal(staging.vars.SHOPIFY_BILLING_TEST_MODE, "true");
  assert.equal(
    staging.vars.SHOPIFY_APP_URL,
    "https://vsn-stock-down-sort-staging.vertexsystemsnetwork.workers.dev",
  );
  assert.equal(
    staging.vars.SCOPES,
    "read_products,write_products,read_inventory",
  );
  assert.ok(!staging.secrets.required.includes("SHOPIFY_APP_URL"));
  assert.ok(!staging.secrets.required.includes("SCOPES"));
  assert.equal(production.vars.APP_ENV, "production");
  assert.equal(production.vars.SHOPIFY_BILLING_TEST_MODE, "false");
});

test("staging deployment is manual, development-sourced, and test-billed", () => {
  const workflow = read(".github/workflows/cloudflare-staging-deploy.yml");

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\npush:/);
  assert.match(workflow, /ref: development/);
  assert.match(workflow, /APP_ENV: staging/);
  assert.match(workflow, /SHOPIFY_BILLING_TEST_MODE: "true"/);
  assert.match(
    workflow,
    /SHOPIFY_APP_URL: https:\/\/vsn-stock-down-sort-staging\.vertexsystemsnetwork\.workers\.dev/,
  );
  assert.match(workflow, /--secrets-file \.worker-secrets\.json/);
  assert.match(workflow, /rm -f \.worker-secrets\.json/);
});


test("staging acceptance probe is signed, staging-only, and read-only", () => {
  const diagnostic = read("app/routes/internal.staging-acceptance.tsx");

  assert.match(
    diagnostic,
    /https:\/\/vsn-stock-down-sort-staging\.vertexsystemsnetwork\.workers\.dev/,
  );
  assert.match(diagnostic, /SIGNATURE_MAX_AGE_SECONDS = 300/);
  assert.match(diagnostic, /crypto\.subtle\.verify/);
  assert.match(diagnostic, /sessionStorage\.findSessionsByShop\(shop\)/);
  assert.match(diagnostic, /unauthenticated\.admin\(shop\)/);
  assert.match(diagnostic, /currentAppInstallation/);
  assert.match(diagnostic, /activeSubscriptions/);
  assert.match(diagnostic, /process\.env\.APP_ENV !== "staging"/);
  assert.doesNotMatch(diagnostic, /appSubscriptionCreate/);
  assert.doesNotMatch(diagnostic, /appSubscriptionCancel/);
  assert.doesNotMatch(diagnostic, /accessToken\s*:/);
  assert.doesNotMatch(diagnostic, /DATABASE_URL/);
});

test("health and staging deployment produce post-deploy evidence", () => {
  const health = read("app/routes/healthz.tsx");
  const workflow = read(".github/workflows/cloudflare-staging-deploy.yml");

  assert.match(health, /"Cache-Control": "no-store"/);
  assert.match(health, /service: "vsn-stock-down-sort"/);
  assert.match(health, /amount: PRO_PLAN\.amount/);
  assert.match(health, /trialDays: PRO_PLAN\.trialDays/);

  assert.match(workflow, /Verify deployed health and billing contract/);
  assert.match(workflow, /staging_runtime_health=pass/);
  assert.match(workflow, /staging_billing_contract=5_days_usd_55/);
  assert.match(workflow, /staging_shop:/);
  assert.match(workflow, /Verify Shopify session and subscription reads/);
  assert.match(workflow, /staging_offline_session=pass/);
  assert.match(workflow, /staging_admin_graphql=pass/);
  assert.match(workflow, /staging_subscription_read=pass/);
  assert.match(workflow, /deferred_until_app_install/);
});
