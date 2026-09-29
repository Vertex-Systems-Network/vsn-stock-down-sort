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
  assert.equal(
    production.vars.SHOPIFY_APP_URL,
    "https://vsn-stock-down-sort-production.vertexsystemsnetwork.workers.dev",
  );
  assert.equal(
    production.vars.SCOPES,
    "read_products,write_products,read_inventory",
  );
  assert.ok(!production.secrets.required.includes("SHOPIFY_APP_URL"));
  assert.ok(!production.secrets.required.includes("SCOPES"));
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


test("production Worker preparation is manual and does not cut over Shopify", () => {
  const workflow = read(".github/workflows/cloudflare-production-prepare.yml");

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\npush:/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /APP_ENV: production/);
  assert.match(workflow, /SHOPIFY_BILLING_TEST_MODE: "false"/);
  assert.match(
    workflow,
    /SHOPIFY_APP_URL: https:\/\/vsn-stock-down-sort-production\.vertexsystemsnetwork\.workers\.dev/,
  );
  assert.match(workflow, /Deploy isolated production Worker only/);
  assert.match(workflow, /production_worker_prepare=pass/);
  assert.match(workflow, /production_shopify_cutover_performed=false/);
  assert.match(workflow, /--secrets-file \.worker-secrets\.json/);
  assert.match(workflow, /rm -f \.worker-secrets\.json/);
  assert.doesNotMatch(workflow, /shopify app deploy/);
  assert.doesNotMatch(workflow, /shopify app config push/);
});


test("billing plan id stays unlimited across runtime contracts", () => {
  const billing = read("app/billing-config.ts");
  const staging = read(".github/workflows/cloudflare-staging-deploy.yml");
  const production = read(".github/workflows/cloudflare-production-prepare.yml");

  assert.match(billing, /id:\s*"unlimited"/);
  assert.doesNotMatch(billing, /id:\s*"pro-plan"/);
  assert.match(staging, /"id": "unlimited"/);
  assert.match(production, /"id": "unlimited"/);
});


test("three Shopify app identities stay isolated", () => {
  const local = read("shopify.app.toml");
  const staging = read("shopify.app.staging.toml");
  const production = read("shopify.app.production.toml");

  assert.match(local, /name = "VSN Stock Down Sort Dev"/);
  assert.match(staging, /name = "VSN Stock Down Sort Staging"/);
  assert.match(production, /name = "VSN Stock Down Sort"/);

  const clientId = (source) =>
    source.match(/client_id\s*=\s*"([^"]+)"/)?.[1] ?? "";

  const localClientId = clientId(local);
  const stagingClientId = clientId(staging);
  const productionClientId = clientId(production);

  assert.ok(localClientId);
  assert.ok(stagingClientId);
  assert.ok(productionClientId);
  assert.notEqual(localClientId, stagingClientId);
  assert.notEqual(localClientId, productionClientId);
  assert.notEqual(stagingClientId, productionClientId);
});


test("local Shopify flow stays npm run dev with the default config", () => {
  const pkg = JSON.parse(read("package.json"));

  assert.equal(pkg.scripts.dev, "shopify app dev");
  assert.ok(!pkg.scripts["shopify:use:local"]);
  assert.ok(!pkg.scripts["shopify:use:staging"]);
  assert.ok(!pkg.scripts["shopify:use:live"]);
  assert.ok(!pkg.scripts["shopify:dev:local"]);
});

test("staging Shopify promotion is GitHub Action driven", () => {
  const versionWorkflow = read(
    ".github/workflows/shopify-staging-version.yml",
  );
  const releaseWorkflow = read(
    ".github/workflows/shopify-staging-release.yml",
  );
  const readinessWorkflow = read(".github/workflows/staging-readiness.yml");

  assert.match(versionWorkflow, /workflow_dispatch:/);
  assert.match(versionWorkflow, /ref: development/);
  assert.match(versionWorkflow, /SHOPIFY_APP_AUTOMATION_TOKEN/);
  assert.match(versionWorkflow, /__SHOPIFY_STAGING_CLIENT_ID__/);
  assert.match(versionWorkflow, /--config staging/);
  assert.match(versionWorkflow, /--no-release/);
  assert.match(
    versionWorkflow,
    /stock-down-sort-staging-\$\{SOURCE_PREFIX\}-\$\{GITHUB_RUN_NUMBER\}/,
  );

  assert.match(releaseWorkflow, /workflow_dispatch:/);
  assert.match(releaseWorkflow, /TARGET_VERSION/);
  assert.match(releaseWorkflow, /app versions list/);
  assert.match(releaseWorkflow, /app release/);
  assert.match(releaseWorkflow, /--config staging/);
  assert.match(releaseWorkflow, /RELEASE_STAGING_SHOPIFY_VERSION/);

  assert.match(readinessWorkflow, /__SHOPIFY_STAGING_CLIENT_ID__/);
  assert.match(
    readinessWorkflow,
    /Refusing staging readiness with the Local\/Dev Shopify client ID/,
  );
  assert.doesNotMatch(
    readinessWorkflow,
    /still contains the staging client ID placeholder/,
  );
});


test("production Shopify promotion is action driven and authorization gated", () => {
  const productionConfig = read("shopify.app.production.toml");
  const readiness = read(".github/workflows/production-readiness.yml");
  const candidate = read(".github/workflows/shopify-production-candidate.yml");
  const release = read(".github/workflows/shopify-production-release.yml");
  const policy = JSON.parse(
    read("config/shopify/production-release.json"),
  );

  assert.match(
    productionConfig,
    /client_id\s*=\s*"__SHOPIFY_PRODUCTION_CLIENT_ID__"/,
  );
  assert.match(
    productionConfig,
    /application_url\s*=\s*"https:\/\/vsn-stock-down-sort-production\.vertexsystemsnetwork\.workers\.dev"/,
  );
  assert.doesNotMatch(productionConfig, /example\.invalid/);

  assert.match(readiness, /__SHOPIFY_PRODUCTION_CLIENT_ID__/);
  assert.match(
    readiness,
    /Refusing production readiness with the Local\/Dev Shopify client ID/,
  );
  assert.doesNotMatch(
    readiness,
    /still contains the production client ID placeholder/,
  );

  assert.match(candidate, /workflow_dispatch:/);
  assert.match(candidate, /ref: main/);
  assert.match(candidate, /SHOPIFY_APP_AUTOMATION_TOKEN/);
  assert.match(candidate, /__SHOPIFY_PRODUCTION_CLIENT_ID__/);
  assert.match(candidate, /--config production/);
  assert.match(candidate, /--no-release/);
  assert.match(
    candidate,
    /stock-down-sort-production-\$\{SOURCE_PREFIX\}-\$\{GITHUB_RUN_NUMBER\}/,
  );
  assert.match(candidate, /billingTestMode/);
  assert.match(candidate, /"id": "unlimited"/);

  assert.match(release, /workflow_dispatch:/);
  assert.match(release, /RELEASE_PRODUCTION_SHOPIFY_VERSION/);
  assert.match(release, /config\/shopify\/production-release\.json/);
  assert.match(release, /release_authorized/);
  assert.match(release, /app versions list/);
  assert.match(release, /app release/);
  assert.match(release, /--config production/);
  assert.match(release, /billingTestMode/);
  assert.match(release, /"id": "unlimited"/);
  assert.doesNotMatch(release, /webhook trigger/);
  assert.doesNotMatch(release, /prisma migrate deploy/);

  assert.equal(policy.release_authorized, false);
  assert.equal(policy.authorized_version, null);
  assert.equal(policy.authorized_source_ref, null);
  assert.equal(policy.shopify.separate_live_app_identity, true);
  assert.equal(policy.billing.plan_id, "unlimited");
  assert.equal(policy.billing.amount, 55);
  assert.equal(policy.billing.trial_days, 5);
});


test("billing entitlement requires the exact current plan", () => {
  const billing = read("app/services/billing.server.ts");
  const api = read("app/routes/app.api.subscription.tsx");
  const plans = read("app/routes/app.plans.tsx");

  assert.match(billing, /export async function getAnyActiveSubscription/);
  assert.match(billing, /subscription\.status === "ACTIVE"/);
  assert.match(billing, /subscription\.name === PRO_PLAN\.name/);
  assert.match(billing, /subscription\.test === isBillingTestMode\(\)/);
  assert.match(billing, /subscription\.trialDays === PRO_PLAN\.trialDays/);
  assert.match(billing, /pricingDetails/);
  assert.match(billing, /\.\.\. on AppRecurringPricing/);
  assert.match(billing, /Number\(pricing\.price\.amount\) === PRO_PLAN\.amount/);
  assert.match(
    billing,
    /pricing\.price\.currencyCode === PRO_PLAN\.currencyCode/,
  );
  assert.match(billing, /pricing\.interval === PRO_PLAN\.interval/);
  assert.match(billing, /subscription\.lineItems\?\.length !== 1/);

  assert.match(api, /getAnyActiveSubscription/);
  assert.match(api, /if \(activeSubscription\)/);
  assert.match(api, /activeSubscription\.id !== subscriptionId/);

  assert.match(plans, /getAnyActiveSubscription/);
  assert.match(plans, /Legacy subscription detected/);
  assert.match(plans, /Cancel existing subscription/);
  assert.match(plans, /Boolean\(activeSubscription\)/);
});


test("collection sorting waits for asynchronous Shopify reorder jobs", () => {
  const sorter = read("app/services/collection-sorter.server.ts");

  assert.match(sorter, /MAX_REORDER_MOVES = 250/);
  assert.match(sorter, /query ReorderJobStatus/);
  assert.match(sorter, /job\(id: \$id\)/);
  assert.match(sorter, /done/);
  assert.match(sorter, /await waitForJob\(admin, jobId\)/);
  assert.match(sorter, /Shopify did not return a reorder job ID/);

  const waitIndex = sorter.indexOf("await waitForJob(admin, jobId)");
  const successTimestampIndex = sorter.indexOf("lastSortedAt: new Date()");

  assert.ok(waitIndex >= 0);
  assert.ok(successTimestampIndex > waitIndex);
});

test("Shopify update webhooks defer sorter work with Cloudflare waitUntil", () => {
  const helper = read("app/cloudflare-context.server.ts");
  const inventory = read(
    "app/routes/webhooks.inventory-levels-update.tsx",
  );
  const product = read("app/routes/webhooks.products-update.tsx");

  assert.match(helper, /waitUntil\(promise\)/);
  assert.match(helper, /await promise/);

  for (const route of [inventory, product]) {
    assert.match(route, /context.*ActionFunctionArgs/);
    assert.match(route, /runWithWorkerLifetime\(context/);
    assert.match(route, /await sortEnabledCollections/);
  }
});


test("Shopify configs use the latest stable API and mandatory compliance webhooks", () => {
  const configs = [
    read("shopify.app.toml"),
    read("shopify.app.staging.toml"),
    read("shopify.app.production.toml"),
  ];

  for (const config of configs) {
    assert.match(config, /api_version = "2026-07"/);
    assert.doesNotMatch(config, /api_version = "2026-10"/);
    assert.match(config, /topics = \[ "app\/scopes_update" \]/);
    assert.match(
      config,
      /compliance_topics = \[ "customers\/data_request" \]/,
    );
    assert.match(
      config,
      /compliance_topics = \[ "customers\/redact" \]/,
    );
    assert.match(config, /compliance_topics = \[ "shop\/redact" \]/);
    assert.match(config, /uri = "\/webhooks\/customers\/data_request"/);
    assert.match(config, /uri = "\/webhooks\/customers\/redact"/);
    assert.match(config, /uri = "\/webhooks\/shop\/redact"/);
  }
});

test("privacy lifecycle purges all shop-scoped persisted data", () => {
  const purge = read("app/services/shop-data.server.ts");
  const uninstall = read("app/routes/webhooks.app.uninstalled.tsx");
  const shopRedact = read("app/routes/webhooks.shop.redact.tsx");
  const dataRequest = read("app/routes/webhooks.customers.data_request.tsx");
  const customerRedact = read("app/routes/webhooks.customers.redact.tsx");

  assert.match(purge, /collectionSetting\.deleteMany/);
  assert.match(purge, /session\.deleteMany/);
  assert.match(purge, /db\.\$transaction/);

  for (const route of [uninstall, shopRedact]) {
    assert.match(route, /authenticate\.webhook\(request\)/);
    assert.match(route, /purgeShopData\(shop\)/);
  }

  for (const route of [dataRequest, customerRedact]) {
    assert.match(route, /authenticate\.webhook\(request\)/);
    assert.doesNotMatch(route, /payload\s*=/);
    assert.doesNotMatch(route, /withPrismaClient|purgeShopData|db\./);
  }
});


test("direct deploy paths reject the Local Shopify identity", () => {
  const stagingDeploy = read(
    ".github/workflows/cloudflare-staging-deploy.yml",
  );
  const productionPrepare = read(
    ".github/workflows/cloudflare-production-prepare.yml",
  );

  assert.match(
    stagingDeploy,
    /Refusing staging deploy with the Local\/Dev Shopify client ID/,
  );
  assert.match(stagingDeploy, /with open\("shopify\.app\.toml", "rb"\)/);
  assert.match(stagingDeploy, /if \[ "\$SHOPIFY_API_KEY" = "\$LOCAL_CLIENT_ID" \]/);

  assert.match(
    productionPrepare,
    /Refusing production Worker preparation with the Local\/Dev Shopify client ID/,
  );
  assert.match(
    productionPrepare,
    /with open\("shopify\.app\.toml", "rb"\)/,
  );
  assert.match(
    productionPrepare,
    /if \[ "\$SHOPIFY_API_KEY" = "\$LOCAL_CLIENT_ID" \]/,
  );
});


test("README reflects the active Stock Down Sort architecture", () => {
  const readme = read("README.md");

  assert.match(readme, /^# VSN Stock Down Sort/m);
  assert.match(readme, /npm run dev/);
  assert.match(readme, /Cloudflare Workers/);
  assert.match(readme, /PostgreSQL/);
  assert.match(readme, /Plan ID: `unlimited`/);
  assert.match(readme, /Shopify Staging Version/);
  assert.match(readme, /Shopify Production Candidate/);
  assert.doesNotMatch(readme, /^# Shopify App Template/m);
  assert.doesNotMatch(readme, /This template uses .*SQLite/);
});


test("hosted sorting uses Cloudflare Queues with local fallback", () => {
  const worker = read("workers/app.js");
  const queueHelper = read("app/sort-queue.server.ts");
  const queueRoute = read("app/routes/internal.queue-sort.tsx");
  const inventory = read("app/routes/webhooks.inventory-levels-update.tsx");
  const product = read("app/routes/webhooks.products-update.tsx");
  const index = read("app/routes/app._index.tsx");
  const staging = JSON.parse(read("wrangler.staging.jsonc"));
  const production = JSON.parse(read("wrangler.production.jsonc"));

  assert.match(worker, /async queue\(batch, env, ctx\)/);
  assert.match(worker, /queueConsumer: true/);
  assert.match(worker, /\/internal\/queue-sort/);

  assert.match(queueHelper, /STOCK_SORT_QUEUE/);
  assert.match(queueHelper, /sendBatch/);
  assert.match(queueHelper, /QUEUE_BATCH_SIZE = 100/);
  assert.match(queueHelper, /return false/);

  assert.match(queueRoute, /queueConsumer.*=== true/s);
  assert.match(queueRoute, /unauthenticated\.admin\(payload\.shop\)/);
  assert.match(queueRoute, /enableCollection/);
  assert.match(queueRoute, /sortEnabledCollections/);
  assert.match(queueRoute, /status: 404/);

  for (const route of [inventory, product]) {
    assert.match(route, /enqueueSortJobs/);
    assert.match(route, /if \(!queued\)/);
    assert.match(route, /sortEnabledCollections/);
  }

  assert.match(index, /enqueueSortJobs/);
  assert.match(index, /reason: "bulk-enable"/);
  assert.match(index, /if \(queued\)/);

  assert.equal(
    staging.queues.producers[0].queue,
    "vsn-stock-down-sort-staging-sort-jobs",
  );
  assert.equal(staging.queues.producers[0].binding, "STOCK_SORT_QUEUE");
  assert.equal(staging.queues.consumers[0].max_batch_size, 1);
  assert.equal(staging.queues.consumers[0].max_concurrency, 1);

  assert.equal(
    production.queues.producers[0].queue,
    "vsn-stock-down-sort-production-sort-jobs",
  );
  assert.equal(production.queues.producers[0].binding, "STOCK_SORT_QUEUE");
  assert.equal(production.queues.consumers[0].max_batch_size, 1);
  assert.equal(production.queues.consumers[0].max_concurrency, 1);
});

test("Shopify pagination uses the 250-node maximum", () => {
  const sorter = read("app/services/collection-sorter.server.ts");

  assert.match(sorter, /PRODUCTS_PAGE_SIZE = 250/);
  assert.match(sorter, /\{ first: 250, after \}/);
  assert.match(sorter, /\{ id: productId, first: 250, after \}/);
});

test("Cloudflare deploy workflows provision sort queues idempotently", () => {
  const staging = read(".github/workflows/cloudflare-staging-deploy.yml");
  const production = read(
    ".github/workflows/cloudflare-production-prepare.yml",
  );

  assert.match(staging, /SORT_QUEUE_NAME: vsn-stock-down-sort-staging-sort-jobs/);
  assert.match(staging, /wrangler@4\.141\.0 queues info/);
  assert.match(staging, /wrangler@4\.141\.0 queues create/);
  assert.match(staging, /ensure_queue "\$SORT_QUEUE_NAME-dlq"/);

  assert.match(
    production,
    /SORT_QUEUE_NAME: vsn-stock-down-sort-production-sort-jobs/,
  );
  assert.match(production, /wrangler@4\.141\.0 queues info/);
  assert.match(production, /wrangler@4\.141\.0 queues create/);
  assert.match(production, /ensure_queue "\$SORT_QUEUE_NAME-dlq"/);
});


test("webhook queue delivery is durable before HTTP acknowledgement", () => {
  const queueHelper = read("app/sort-queue.server.ts");
  const inventory = read(
    "app/routes/webhooks.inventory-levels-update.tsx",
  );
  const product = read("app/routes/webhooks.products-update.tsx");

  assert.match(
    queueHelper,
    /Hosted Worker is missing the required STOCK_SORT_QUEUE binding/,
  );
  assert.match(queueHelper, /if \(!cloudflare\?\.env\) return false/);

  for (const route of [inventory, product]) {
    const enqueueIndex = route.indexOf("await enqueueSortJobs");
    const fallbackIndex = route.indexOf("await runWithWorkerLifetime");

    assert.ok(enqueueIndex >= 0);
    assert.ok(fallbackIndex > enqueueIndex);
    assert.match(route, /Webhook processing failed/);
    assert.match(route, /status: 500/);
    assert.match(route, /if \(!queued\)/);
  }
});


test("health requires the sort queue only in hosted environments", () => {
  const health = read("app/routes/healthz.tsx");
  const staging = read(".github/workflows/cloudflare-staging-deploy.yml");
  const production = read(
    ".github/workflows/cloudflare-production-prepare.yml",
  );

  assert.match(health, /environment !== "development"/);
  assert.match(health, /STOCK_SORT_QUEUE/);
  assert.match(health, /sortQueueConfigured/);
  assert.match(health, /sortQueueRequired/);
  assert.match(health, /queueReady/);
  assert.match(health, /status: ok \? 200 : 503/);
  assert.match(health, /mode: sortQueueConfigured \? "cloudflare-queue" : "local-fallback"/);

  assert.match(staging, /staging_sort_queue=pass/);
  assert.match(staging, /sort_queue\.get\("required"\) is not True/);
  assert.match(staging, /sort_queue\.get\("configured"\) is not True/);
  assert.match(staging, /sort_queue\.get\("ready"\) is not True/);
  assert.match(staging, /cloudflare-queue/);

  assert.match(production, /production_sort_queue=pass/);
  assert.match(production, /sort_queue\.get\("required"\) is not True/);
  assert.match(production, /sort_queue\.get\("configured"\) is not True/);
  assert.match(production, /sort_queue\.get\("ready"\) is not True/);
  assert.match(production, /cloudflare-queue/);
});


test("bulk disable uses one database update", () => {
  const index = read("app/routes/app._index.tsx");
  const disableAllStart = index.indexOf('if (intent === "disableAll")');
  const disableAllEnd = index.indexOf('return { ok: false, message: "Unknown action." }');

  assert.ok(disableAllStart >= 0);
  assert.ok(disableAllEnd > disableAllStart);

  const block = index.slice(disableAllStart, disableAllEnd);

  assert.match(block, /collectionSetting\.updateMany/);
  assert.match(block, /where: \{ shop: session\.shop, enabled: true \}/);
  assert.match(block, /enabled: false/);
  assert.match(block, /lastError: null/);
  assert.doesNotMatch(block, /collectionSetting\.findMany/);
  assert.doesNotMatch(block, /disableCollection\(/);
});


test("environment secrets audit checks required deployment credentials", () => {
  const workflow = read(".github/workflows/environment-secrets-audit.yml");

  assert.match(workflow, /name: Environment Secrets Audit/);
  assert.match(workflow, /AUDIT_ENVIRONMENT_SECRETS/);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /environment: production/);

  for (const name of [
    "DATABASE_URL",
    "DIRECT_URL",
    "SHOPIFY_API_KEY",
    "SHOPIFY_API_SECRET",
    "SHOPIFY_APP_AUTOMATION_TOKEN",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
  ]) {
    assert.match(workflow, new RegExp(name));
  }

  assert.match(
    workflow,
    /SHOPIFY_API_KEY matches the Local\/Dev Shopify client ID/,
  );
  assert.match(workflow, /__SHOPIFY_STAGING_CLIENT_ID__/);
  assert.match(workflow, /__SHOPIFY_PRODUCTION_CLIENT_ID__/);
  assert.doesNotMatch(workflow, /echo "\$DATABASE_URL"/);
  assert.doesNotMatch(workflow, /echo "\$SHOPIFY_API_SECRET"/);
});


test("manual development flow keeps development pushes away from staging and production", () => {
  const flow = JSON.parse(read("config/development-flow.json"));
  const staging = read(".github/workflows/cloudflare-staging-deploy.yml");
  const production = read(".github/workflows/cloudflare-production-prepare.yml");

  assert.equal(flow.development_branch, "development");
  assert.equal(flow.release_branch, "main");
  assert.equal(flow.local.command, "npm run dev");
  assert.equal(flow.staging.source_branch, "development");
  assert.equal(flow.staging.auto_deploy_runtime_changes, false);
  assert.equal(flow.staging.deploy_mode, "manual_dispatch_from_development");
  assert.equal(flow.staging.confirmation, "DEPLOY_DEVELOPMENT_TO_STAGING");
  assert.equal(flow.live.source_branch, "main");
  assert.equal(flow.live.auto_deploy, false);
  assert.equal(flow.invariants.development_push_cannot_deploy_staging, true);
  assert.equal(flow.invariants.development_push_cannot_deploy_production, true);
  assert.equal(flow.invariants.main_push_cannot_deploy_production, true);

  assert.match(staging, /workflow_dispatch:/);
  assert.doesNotMatch(staging, /\npush:/);
  assert.match(staging, /DEPLOY_DEVELOPMENT_TO_STAGING/);
  assert.match(staging, /ref: development/);
  assert.match(staging, /persist-credentials: false/);

  assert.match(production, /workflow_dispatch:/);
  assert.doesNotMatch(production, /\npush:/);
  assert.match(production, /ref: main/);
});

test("manual staging deploy owns queue bootstrap", () => {
  const staging = read(".github/workflows/cloudflare-staging-deploy.yml");

  assert.match(staging, /Ensure staging sort queues exist/);
  assert.match(staging, /wrangler@4\.141\.0 queues info/);
  assert.match(staging, /wrangler@4\.141\.0 queues create/);
  assert.match(staging, /ensure_queue "\$SORT_QUEUE_NAME"/);
  assert.match(staging, /ensure_queue "\$SORT_QUEUE_NAME-dlq"/);
  assert.equal(fs.existsSync(path.join(root, ".github/workflows/cloudflare-staging-bootstrap.yml")), false);
});
