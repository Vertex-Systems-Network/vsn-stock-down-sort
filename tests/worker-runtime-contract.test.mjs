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
    "read_products,write_products,read_inventory,read_locations,read_publications,write_publications",
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
    "read_products,write_products,read_inventory,read_locations,read_publications,write_publications",
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
  assert.match(diagnostic, /getCurrentSubscriptionPlan/);
  assert.match(diagnostic, /getShopifyBillingMode/);
  assert.match(diagnostic, /process\.env\.APP_ENV !== "staging"/);
  assert.doesNotMatch(diagnostic, /appSubscriptionCreate/);
  assert.doesNotMatch(diagnostic, /appSubscriptionCancel/);
  assert.doesNotMatch(diagnostic, /accessToken\s*:/);
  assert.doesNotMatch(diagnostic, /DATABASE_URL/);
});

test("health and staging deployment produce post-deploy evidence", () => {
  const health = read("app/routes/healthz.tsx");
  const deploy = read(".github/workflows/cloudflare-staging-deploy.yml");
  const acceptance = read(".github/workflows/staging-runtime-acceptance.yml");

  assert.match(health, /"Cache-Control": "no-store"/);
  assert.match(health, /service: "vsn-stock-down-sort"/);
  assert.match(health, /billingCatalog/);
  assert.match(health, /BILLING_PLANS/);

  assert.match(deploy, /Verify deployed health and billing contract/);
  assert.match(deploy, /staging_runtime_health=pass/);
  assert.match(deploy, /staging_billing_contract=four_plans_10_day_trials/);
  assert.match(
    deploy,
    /staging_shopify_acceptance=deferred_to_staging_runtime_acceptance_workflow/,
  );

  assert.match(acceptance, /staging_shop:/);
  assert.match(acceptance, /billing_plan_id:/);
  assert.match(acceptance, /EXPECTED_BILLING_PLAN_ID/);
  assert.match(acceptance, /recognizedPlanIds/);
  assert.match(acceptance, /Verify signed Shopify session and subscription reads/);
  assert.match(acceptance, /staging_offline_session=pass/);
  assert.match(acceptance, /staging_admin_graphql=pass/);
  assert.match(acceptance, /staging_subscription_read=pass/);
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
  assert.match(workflow, /workflow_call:/);
  assert.match(workflow, /prisma migrate deploy --schema prisma\/cloud\/schema\.prisma/);
  assert.match(workflow, /Deploy isolated production Worker only/);
  assert.match(workflow, /production_worker_prepare=pass/);
  assert.match(workflow, /production_shopify_cutover_performed=false/);
  assert.match(workflow, /--secrets-file \.worker-secrets\.json/);
  assert.match(workflow, /rm -f \.worker-secrets\.json/);
  assert.doesNotMatch(workflow, /shopify app deploy/);
  assert.doesNotMatch(workflow, /shopify app config push/);

  assert.equal(
    fs.existsSync(
      path.join(root, ".github/workflows/cloudflare-production-bootstrap-once.yml"),
    ),
    false,
  );
});


test("four stable billing plan IDs stay consistent across runtime contracts", () => {
  const billing = read("app/billing-config.ts");
  const staging = read(".github/workflows/cloudflare-staging-deploy.yml");
  const production = read(".github/workflows/cloudflare-production-prepare.yml");

  for (const id of ["starter", "growth", "pro", "unlimited"]) {
    assert.match(billing, new RegExp(`"${id}"`));
    assert.match(staging, new RegExp(`"id": "${id}"`));
    assert.match(production, new RegExp(`"id": "${id}"`));
  }
  assert.doesNotMatch(billing, /id:\s*"pro-plan"/);
});


test("three Shopify app identities stay isolated", () => {
  const local = read("shopify.app.toml");
  const staging = read("shopify.app.staging.toml");
  const production = read("shopify.app.production.toml");

  assert.match(local, /name = "VSN \\| Stock Down Sort Dev"/);
  assert.match(staging, /name = "VSN \\| Stock Down Sort Staging"/);
  assert.match(production, /name = "VSN \\| Stock Down Sort"/);

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


test("local Shopify flow stays npm run dev with the explicit Local config", () => {
  const pkg = JSON.parse(read("package.json"));
  const localDefault = read("shopify.app.toml");
  const localNamed = read("shopify.app.local.toml");

  assert.equal(pkg.scripts.dev, "npx --yes shopify@4.8.2 app dev --config local");
  assert.equal(pkg.scripts["dev:reset"], "npx --yes shopify@4.8.2 app dev --reset");
  assert.match(localNamed, /name = "VSN \\| Stock Down Sort Dev"/);
  assert.match(localNamed, /automatically_update_urls_on_dev = true/);
  assert.equal(
    localNamed.match(/^client_id = "([^"]+)"$/m)?.[1],
    localDefault.match(/^client_id = "([^"]+)"$/m)?.[1],
  );
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

  assert.match(productionConfig, /client_id\s*=\s*"[0-9a-f]+"/);
  assert.doesNotMatch(
    productionConfig,
    /__SHOPIFY_PRODUCTION_CLIENT_ID__/,
  );
  assert.match(
    productionConfig,
    /application_url\s*=\s*"https:\/\/vsn-stock-down-sort-production\.vertexsystemsnetwork\.workers\.dev"/,
  );
  assert.doesNotMatch(productionConfig, /example\.invalid/);

  assert.match(readiness, /committed Live Shopify client ID/);
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
  assert.match(candidate, /committed Live Shopify client ID/);
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
  assert.equal(
    policy.authorized_version,
    "stock-down-sort-production-930bb2039244-2",
  );
  assert.equal(
    policy.authorized_source_ref,
    "930bb2039244ecafd0ae9d3bb538898094e86638",
  );
  assert.equal(policy.shopify.separate_live_app_identity, true);
  assert.deepEqual(policy.billing.plan_ids, ["starter", "growth", "pro", "unlimited"]);
  assert.equal(policy.billing.interval, "EVERY_30_DAYS");
  assert.equal(policy.billing.trial_days, 10);
  assert.equal(policy.status, "released");
  assert.equal(policy.release_record?.run_id, 37151020224);
  assert.equal(policy.release_record?.version_released_to_users, true);
  assert.equal(policy.release_record?.remote_app_name, "VSN | Stock Down Sort");
});


test("plans page uses the Metafields-style responsive workspace cards", () => {
  const plans = read("app/routes/app.plans.tsx");
  const workspace = read("app/styles/workspace.css");

  assert.match(plans, /vsn-plan-grid/);
  assert.match(plans, /Most popular/);
  assert.match(plans, /PageIntro/);
  assert.match(plans, /plan\.amount\.toFixed\(2\)/);
  assert.match(workspace, /\.vsn-plan-grid/);
  assert.match(workspace, /grid-template-columns: repeat\(4, minmax\(220px, 1fr\)\)/);
  assert.doesNotMatch(plans, /window\.top\.location\.href/);
});

test("billing approval return URL uses the Shopify Admin app handle", () => {
  const billing = read("app/services/billing.server.ts");
  const api = read("app/routes/app.api.subscription.tsx");

  assert.match(
    billing,
    /query StockDownSortCurrentAppHandle[\s\S]*currentAppInstallation[\s\S]*app \{[\s\S]*handle/s,
  );
  assert.match(
    billing,
    /https:\/\/admin\.shopify\.com\/store\/\$\{encodeURIComponent\([\s\S]*storeSlug[\s\S]*\)\}\/apps\/\$\{encodeURIComponent\(handle\)\}\/app\/plans/,
  );
  assert.match(
    api,
    /getEmbeddedAdminBillingReturnUrl\([\s\S]*admin,[\s\S]*session\.shop,[\s\S]*\)/s,
  );
  assert.doesNotMatch(
    api,
    /new URL\("\/app\/plans", appUrl\)/,
  );
  assert.doesNotMatch(
    api,
    /SHOPIFY_APP_URL is not configured/,
  );
});

test("plan switching uses a fresh App Bridge token instead of fetcher revalidation", () => {
  const plans = read("app/routes/app.plans.tsx");
  const client = read("app/billing-client.ts");
  const api = read("app/routes/app.api.subscription.tsx");

  assert.match(plans, /submitBilling\(formData, location\.search\)/);
  assert.doesNotMatch(plans, /useFetcher/);
  assert.match(client, /shopify\?\.idToken/);
  assert.match(client, /await shopify\.idToken\(\)/);
  assert.match(client, /Authorization: `Bearer \$\{token\}`/);
  assert.match(client, /redirect: "error"/);
  assert.match(client, /cache: "no-store"/);
  assert.match(api, /\[billing\] subscription confirmation created/);
});

test("billing confirmation URL has automatic top navigation plus a visible approval fallback", () => {
  const api = read("app/routes/app.api.subscription.tsx");
  const plans = read("app/routes/app.plans.tsx");
  const client = read("app/billing-client.ts");

  assert.match(api, /confirmationUrl: result\.confirmationUrl/);
  assert.match(api, /planId: requestedPlanId/);
  assert.doesNotMatch(api, /return redirect\(result\.confirmationUrl/);

  assert.match(client, /validateBillingConfirmation/);
  assert.match(client, /admin\.shopify\.com/);
  assert.match(client, /url\.hostname\.endsWith\("\.myshopify\.com"\)/);
  assert.match(client, /url\.pathname\.startsWith\("\/admin\/charges\/"\)/);
  assert.match(client, /window\.open\(confirmationUrl, "_top"\)/);
  assert.match(plans, /openBillingConfirmation\(response\.confirmationUrl\)/);
  assert.match(plans, /Continue to Shopify plan approval/);
  assert.match(plans, /target="_top"/);
});

test("billing failures decode SDK shapes and expose safe diagnostics", () => {
  const billing = read("app/services/billing.server.ts");
  const api = read("app/routes/app.api.subscription.tsx");
  const pkg = JSON.parse(read("package.json"));

  assert.equal(pkg.dependencies["@shopify/shopify-api"], "13.1.0");
  assert.match(
    billing,
    /import \{ GraphqlQueryError \} from "@shopify\/shopify-api"/,
  );
  assert.match(billing, /error instanceof GraphqlQueryError/);
  assert.match(billing, /constructor\?\.\s*name/);
  assert.match(billing, /Object\.getOwnPropertyNames/);
  assert.match(billing, /error instanceof Response/);
  assert.match(billing, /export function getShopifyBillingErrorDiagnostic/);
  assert.match(billing, /export async function describeShopifyBillingError/);
  assert.match(
    billing,
    /Billing API subscriptions require a Public-distribution app/,
  );

  assert.match(api, /await describeShopifyBillingError\(error\)/);
  assert.match(api, /getShopifyBillingErrorDiagnostic\(error\)/);
  assert.match(api, /diagnostic,/);
  assert.match(api, /\[billing\] subscription action failed/);
});

test("plans page renders billing failures and approval state inside the workspace", () => {
  const plans = read("app/routes/app.plans.tsx");

  assert.match(plans, /vsn-notice error/);
  assert.match(plans, /result\?\.error/);
  assert.match(plans, /result\?\.confirmationUrl/);
  assert.match(plans, /If Shopify did not open automatically/);
  assert.doesNotMatch(plans, /useFetcher/);
});

test("billing entitlement requires the exact current plan", () => {
  const billing = read("app/services/billing.server.ts");
  const api = read("app/routes/app.api.subscription.tsx");
  const plans = read("app/routes/app.plans.tsx");

  assert.match(billing, /export async function getAnyActiveSubscription/);
  assert.match(billing, /subscription\.status === "ACTIVE"/);
  assert.match(billing, /resolveSubscriptionPlan/);
  assert.match(billing, /subscription\.name === plan\.shopify_name/);
  assert.match(billing, /subscription\.test === isBillingTestMode\(\)/);
  assert.match(billing, /subscription\.trialDays === plan\.trial_days/);
  assert.match(billing, /LEGACY_PLAN/);
  assert.match(billing, /replacementBehavior/);
  assert.match(billing, /pricingDetails/);
  assert.match(billing, /\.\.\. on AppRecurringPricing/);
  assert.match(billing, /Number\(pricing\.price\.amount\) === plan\.amount/);
  assert.match(billing, /pricing\.price\.currencyCode === BILLING_CATALOG\.currencyCode/);
  assert.match(billing, /pricing\.interval === BILLING_CATALOG\.interval/);
  assert.match(billing, /subscription\.lineItems\?\.length !== 1/);

  assert.match(api, /getAnyActiveSubscription/);
  assert.match(api, /if \(activeSubscription && !current\)/);
  assert.match(api, /activeSubscription\.id !== subscriptionId/);
  assert.match(api, /activeSubscription\.status !== "ACTIVE"/);
  assert.doesNotMatch(api, /current\.subscription\.id !== subscriptionId/);
  assert.doesNotMatch(api, /Cancellation is blocked until it is reviewed/);

  assert.match(plans, /getAnyActiveSubscription/);
  assert.match(plans, /Legacy subscription detected/);
  assert.match(plans, /A previous subscription no longer matches the current catalog/);
  assert.match(plans, /Cancel incompatible subscription/);
  assert.match(plans, /activeIsUnknown/);
  assert.match(plans, /Boolean\(activeSubscription\)/);
  assert.match(plans, /submitBilling\(formData, location\.search\)/);
});




test("Shopify App Pricing is the submission target while Billing API remains legacy-compatible", () => {
  const strategy = JSON.parse(read("config/shopify/billing-strategy.json"));
  const billing = read("app/services/billing.server.ts");
  const partner = read("app/services/shopify-app-pricing.server.ts");

  assert.equal(strategy.submission_target, "shopify_app_store_public_app");
  assert.equal(strategy.active_method, "shopify_app_pricing");
  assert.equal(
    strategy.partner_dashboard_required_pricing_method,
    "shopify_app_pricing",
  );
  assert.equal(
    strategy.repository_mode,
    "dual_compatibility_until_legacy_migration",
  );
  assert.equal(
    strategy.manual_pricing_legacy_compatibility
      .new_subscription_creation_allowed,
    false,
  );
  assert.deepEqual(
    strategy.public_plans.map((plan) => [plan.id, plan.amount, plan.trial_days]),
    [
      ["starter", 10.99, 10],
      ["growth", 19.99, 10],
      ["pro", 34.99, 10],
      ["unlimited", 70, 10],
    ],
  );
  assert.match(partner, /activeSubscription/);
  assert.match(partner, /pricing_plans/);
  assert.match(billing, /getShopifyAppPricingSubscription/);
  assert.match(billing, /appSubscriptionCreate/);
  assert.equal(
    strategy.shopify_app_pricing_migration.status,
    "repository_ready_dashboard_configuration_pending",
  );
});

test("four-plan product catalog is canonical and all paid plans have 10-day trials", () => {
  const catalog = JSON.parse(read("config/ai/product-plan.json"));
  const plans = catalog.plans;

  assert.deepEqual(
    plans.map((plan) => plan.id),
    ["starter", "growth", "pro", "unlimited"],
  );
  assert.deepEqual(
    plans.map((plan) => plan.amount),
    [10.99, 19.99, 34.99, 70],
  );
  assert.deepEqual(plans.map((plan) => plan.trial_days), [10, 10, 10, 10]);
  assert.deepEqual(
    plans.map((plan) => plan.catalog_limits.products),
    ["unlimited", "unlimited", "unlimited", "unlimited"],
  );
  assert.deepEqual(
    plans.map((plan) => plan.catalog_limits.collections),
    ["unlimited", "unlimited", "unlimited", "unlimited"],
  );
  assert.equal(catalog.currency_code, "USD");
  assert.equal(catalog.billing_interval, "EVERY_30_DAYS");
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



test("authoritative product docs match the current four-plan contract", () => {
  const agents = read("AGENTS.md");
  const idea = read("PROJECT-IDEA.md");
  const environments = read("docs/environments.md");
  const production = read("shopify.app.production.toml");

  for (const source of [agents, idea, environments]) {
    assert.match(source, /starter/);
    assert.match(source, /growth/);
    assert.match(source, /pro/);
    assert.match(source, /unlimited/);
    assert.match(source, /10-day/);
  }

  assert.match(agents, /VSN \| Stock Down Sort Dev/);
  assert.match(agents, /VSN \| Stock Down Sort Staging/);
  assert.match(agents, /VSN \| Stock Down Sort/);
  assert.doesNotMatch(
    agents,
    /Shopify billing contract:\s*plan id `unlimited`, USD 55 \/ 30 days, 5-day trial/,
  );

  assert.doesNotMatch(idea, /Shopify plan ID:\s*unlimited/);
  assert.doesNotMatch(environments, /The Pro plan remains:/);
  assert.match(environments, /legacy USD 55 \/ 5-day/i);

  const productionClientId =
    production.match(/^client_id = "([^"]+)"$/m)?.[1];
  assert.ok(productionClientId);
  assert.notEqual(productionClientId, "__SHOPIFY_PRODUCTION_CLIENT_ID__");
  assert.match(environments, /contains the Live Shopify client\s+ID by design/i);
  assert.doesNotMatch(
    environments,
    /shopify\.app\.production\.toml.*__SHOPIFY_PRODUCTION_CLIENT_ID__/s,
  );
});

test("README reflects the active Stock Down Sort architecture", () => {
  const readme = read("README.md");

  assert.match(readme, /^# VSN Stock Down Sort/m);
  assert.match(readme, /npm run dev/);
  assert.match(readme, /npm run local:prepare/);
  assert.match(readme, /Prisma \+ SQLite/i);
  assert.match(readme, /prisma:parity/i);
  assert.match(readme, /Cloudflare Workers/);
  assert.match(readme, /PostgreSQL/);
  assert.match(readme, /Four plan IDs/);
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
  assert.match(workflow, /environment: cloudflare-staging/);
  assert.match(workflow, /environment: cloudflare-production/);

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
  assert.match(workflow, /SHOPIFY_API_KEY does not match the committed Live Shopify client ID/);
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
  assert.equal(flow.local.prepare_command, "npm run local:prepare");
  assert.equal(
    flow.local.certify_command,
    "npm run local:certify -- <local-health-url>/healthz",
  );
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


test("repository management follows the VSN Metafields-style canonical state chain", () => {
  const manifest = JSON.parse(read(".ai/manifest.json"));
  const state = JSON.parse(read("config/ai/project-state.json"));
  const plan = JSON.parse(read("config/ai/execution-plan.json"));
  const modules = JSON.parse(read("config/ai/modules-bank.json"));
  const supervisor = JSON.parse(read("config/coordination/supervisor-state.json"));

  assert.equal(manifest.schema_version, 7);
  assert.ok(manifest.common.includes("config/ai/project-state.json"));
  assert.ok(manifest.common.includes("config/ai/execution-plan.json"));
  assert.ok(manifest.roles.supervisor.includes("SUPERVISOR.md"));
  assert.ok(manifest.roles.worker.includes("AUTO-AGENT.md"));

  assert.equal(plan.active_issue, state.active_issue);
  assert.equal(state.last_reconciled_repository_ref.length, 40);

  const expectedActiveStatus =
    state.active_issue === null ? "complete" : "in_progress";
  assert.equal(
    plan.phases.find((phase) => phase.id === state.current_phase)?.status,
    expectedActiveStatus,
  );
  assert.equal(
    plan.work_units.find(
      (workUnit) => workUnit.id === state.current_work_unit,
    )?.status,
    expectedActiveStatus,
  );

  assert.equal(state.current_phase, "PHASE-10");
  assert.equal(state.current_module, "support-fulfillment");
  assert.equal(state.current_work_unit, "ISSUE-128-WU-01");
  assert.equal(
    state.active_issue_status,
    state.active_issue === null ? "none" : "open",
  );
  if (state.active_issue === null) {
    assert.match(state.next_valid_work_unit, /repository development.*complete/i);
    assert.match(state.next_valid_work_unit, /final acceptance cycle/i);
    assert.equal(state.finalization_track?.promotion_lock, true);
    assert.equal(state.finalization_track?.items?.length, 6);
    assert.equal(
      state.finalization_track.items.find((item) => item.id === 5)?.title,
      "Public-app billing verification and Unlimited USD 70 alignment",
    );
  } else {
    assert.match(state.next_valid_work_unit, /support request fulfillment/i);
    assert.match(state.next_valid_work_unit, /runtime acceptance.*deferred/i);
  }

  assert.equal(plan.phases[0].id, "PHASE-01");
  assert.ok(plan.work_units.length >= 44);
  for (const id of [
    "ISSUE-97-WU-01",
    "ISSUE-97-WU-02",
    "ISSUE-97-WU-03",
    "ISSUE-97-WU-04",
    "ISSUE-100-WU-01",
    "ISSUE-100-WU-02",
    "ISSUE-100-WU-03",
    "ISSUE-100-WU-04",
    "ISSUE-103-WU-01",
    "ISSUE-103-WU-02",
    "ISSUE-103-WU-03",
    "ISSUE-103-WU-04",
    "ISSUE-106-WU-01",
    "ISSUE-106-WU-02",
    "ISSUE-106-WU-03",
    "ISSUE-106-WU-04",
    "ISSUE-109-WU-01",
    "ISSUE-109-WU-02",
    "ISSUE-109-WU-03",
    "ISSUE-109-WU-04",
    "ISSUE-113-WU-01",
    "ISSUE-113-WU-02",
    "ISSUE-113-WU-03",
    "ISSUE-113-WU-04",
    "ISSUE-117-WU-01",
    "ISSUE-117-WU-02",
    "ISSUE-117-WU-03",
    "ISSUE-117-WU-04",
    "ISSUE-120-WU-01",
    "ISSUE-120-WU-02",
    "ISSUE-120-WU-03",
    "ISSUE-120-WU-04",
  ]) {
    assert.equal(
      plan.work_units.find((workUnit) => workUnit.id === id)?.status,
      "complete",
      id,
    );
  }
  assert.equal(
    plan.work_units.find(
      (workUnit) => workUnit.id === "ISSUE-128-WU-01",
    )?.status,
    expectedActiveStatus,
  );

  for (const id of [
    "MOD-MGMT",
    "MOD-LOCAL",
    "MOD-STAGING",
    "MOD-PRODUCTION",
    "MOD-SORTING-CONTROLS",
    "MOD-PRODUCT-VISIBILITY",
    "MOD-ANALYTICS-HISTORY",
    "MOD-AUTOMATION-RULES",
    "MOD-LOW-STOCK-ALERTS",
    "MOD-CONTEXT-VISIBILITY",
    "MOD-API-INTEGRATIONS",
    "MOD-PRIORITY-SUPPORT",
  ]) {
    assert.equal(
      modules.modules.find((module) => module.id === id)?.status,
      "complete",
      id,
    );
  }
  assert.equal(
    modules.modules.find(
      (module) => module.id === "MOD-SUPPORT-FULFILLMENT",
    )?.status,
    expectedActiveStatus,
  );

  assert.equal(supervisor.supervisor.status, "unassigned");
  assert.equal(supervisor.supervisor.lease_status, "not_acquired");
  assert.equal(supervisor.active_worker_count, 0);
  assert.equal(supervisor.last_reconciled_main_sha.length, 40);
});

test("legacy ai state is compatibility-only, not a competing source of truth", () => {
  const state = JSON.parse(read("config/ai/project-state.json"));
  const current = read(".ai/state/CURRENT-STATE.yaml");
  const tasks = read(".ai/tasks/INDEX.yaml");
  const expectedActive = state.active_issue === null ? "null" : String(state.active_issue);
  const expectedTaskStatus =
    state.active_issue === null ? "complete" : "in_progress";

  assert.match(current, /compatibility_mirror: true/);
  assert.match(current, /canonical_state: config\/ai\/project-state\.json/);
  assert.match(tasks, /compatibility_mirror: true/);
  assert.match(tasks, /canonical_plan: config\/ai\/execution-plan\.json/);
  assert.ok(current.includes(`active_issue: ${expectedActive}`));
  assert.ok(current.includes(`current_phase: ${state.current_phase}`));
  assert.ok(current.includes(`current_work_unit: ${state.current_work_unit}`));
  assert.ok(tasks.includes(`active_issue: ${expectedActive}`));
  assert.ok(tasks.includes(`active_work_unit: ${state.current_work_unit}`));
  assert.ok(tasks.includes(`status: ${expectedTaskStatus}`));
});


test("management registries are valid JSON and do not inherit VSN Metafields project identity", () => {
  const dirs = [
    "config/ai",
    "config/architecture",
    "config/assurance",
    "config/audit",
    "config/consent",
    "config/coordination",
    "config/integrations",
    "config/operations",
    "config/release",
    "config/risk",
    "config/security",
    "config/traceability",
  ];

  for (const dir of dirs) {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const relativePath = path.join(dir, entry.name);
      const source = read(relativePath);
      assert.doesNotThrow(() => JSON.parse(source), relativePath);
      assert.doesNotMatch(source, /Vertex-Systems-Network\/vsn-metafields/i, relativePath);
    }
  }
});


test("environment gate records accepted SQLite Local evidence before Staging", () => {
  const gates = JSON.parse(read("config/release/environment-gates.json"));
  const releaseFlow = read("docs/development-release-flow.md");

  assert.equal(gates.local_dev.status, "accepted");
  assert.match(gates.local_dev.accepted_source_ref, /^[0-9a-f]{40}$/);
  assert.ok(Number.isFinite(Date.parse(gates.local_dev.accepted_at)));
  assert.equal(gates.local_dev.evidence_record.branch, "development");
  assert.equal(gates.local_dev.evidence_record.database_provider, "sqlite");
  assert.equal(gates.local_dev.evidence_record.database_file, "prisma/dev.sqlite");
  assert.equal(gates.local_dev.evidence_record.sqlite_gitignored, true);
  assert.equal(gates.local_dev.evidence_record.prisma_validate, "passed");
  assert.equal(gates.local_dev.evidence_record.prisma_generate, "passed");
  assert.equal(gates.local_dev.evidence_record.prisma_migrate_deploy, "passed");
  assert.equal(gates.local_dev.evidence_record.shopify_dev_health.status, 200);
  assert.equal(gates.local_dev.evidence_record.shopify_dev_health.environment, "development");
  assert.equal(gates.local_dev.evidence_record.shopify_dev_health.billingTestMode, true);
  assert.equal(gates.local_dev.evidence_record.shopify_dev_health.database, "sqlite");
  assert.match(releaseFlow, /Prisma \+ SQLite/i);
  assert.match(releaseFlow, /Staging.*Neon PostgreSQL/is);
});

test("local development uses SQLite while hosted environments remain Neon PostgreSQL", () => {
  const flow = JSON.parse(read("config/development-flow.json"));
  const topology = JSON.parse(read("config/database/environment-topology.json"));
  const web = read("shopify.web.toml");
  const validator = read("scripts/validate-local-sqlite-env.mjs");
  const localExample = read(".env.local.example");
  const runner = read("scripts/local-dev-runner.mjs");
  const envLoader = read("scripts/local-env.mjs");

  assert.equal(flow.local.source_branch, "development");
  assert.equal(flow.local.command, "npm run dev");
  assert.equal(flow.local.database.provider, "sqlite");
  assert.equal(flow.local.database.file, "prisma/dev.sqlite");
  assert.equal(flow.local.database.gitignored, true);
  assert.equal(flow.local.database.hosted_credentials_required, false);
  assert.equal(flow.invariants.local_database_must_be_sqlite, true);
  assert.equal(topology.local.database.provider, "sqlite");
  assert.equal(topology.staging.database.provider, "neon_postgresql");
  assert.equal(topology.production.database.provider, "neon_postgresql");
  assert.equal(topology.local.database.reuse_staging_or_production, false);

  assert.match(web, /local-dev-runner\.mjs predev/);
  assert.match(web, /local-dev-runner\.mjs dev/);
  assert.match(runner, /validateLocalSqliteEnv/);
  assert.match(runner, /prisma\/schema\.prisma/);
  assert.doesNotMatch(runner, /prisma\/cloud\/schema\.prisma/);
  assert.match(envLoader, /hosted database/i);
  assert.match(validator, /validateLocalSqliteEnv/);
  assert.match(localExample, /requires no Neon credentials/i);
  assert.doesNotMatch(localExample, /NEON_API_KEY/);
  assert.doesNotMatch(localExample, /DIRECT_URL/);
});

test("accepted ADR-0001 is now implemented in operational Local topology", () => {
  const adr = JSON.parse(read("config/architecture/decision-records.json"));
  const modules = JSON.parse(read("config/ai/modules-bank.json"));
  const plan = JSON.parse(read("config/ai/execution-plan.json"));
  const flow = JSON.parse(read("config/development-flow.json"));
  const topology = JSON.parse(read("config/database/environment-topology.json"));

  const decision = adr.decisions.find((item) => item.id === "ADR-0001");
  const localModule = modules.modules.find((module) => module.id === "MOD-LOCAL");
  const oldLocal = plan.work_units.find(
    (workUnit) => workUnit.id === "ISSUE-32-WU-LOCAL-01",
  );
  const sqliteLocal = plan.work_units.find(
    (workUnit) => workUnit.id === "ISSUE-32-WU-LOCAL-SQLITE-01",
  );

  assert.ok(decision);
  assert.equal(decision.status, "accepted");
  assert.ok(localModule);
  assert.ok(sqliteLocal);
  assert.equal(oldLocal.status, "deprecated");
  assert.equal(
    oldLocal.superseded_by_work_unit,
    "ISSUE-32-WU-LOCAL-SQLITE-01",
  );
  assert.ok(localModule.scope.includes("Prisma Local SQLite schema"));
  assert.equal(flow.local.database.provider, "sqlite");
  assert.equal(topology.local.database.provider, "sqlite");
  assert.equal(topology.staging.database.provider, "neon_postgresql");
  assert.equal(topology.production.database.provider, "neon_postgresql");
});

test("GitHub workflows bind to exact Cloudflare environments", () => {
  const stagingFiles = [
    ".github/workflows/environment-secrets-audit.yml",
    ".github/workflows/staging-readiness.yml",
    ".github/workflows/cloudflare-staging-deploy.yml",
    ".github/workflows/shopify-staging-version.yml",
    ".github/workflows/shopify-staging-release.yml",
  ];
  for (const file of stagingFiles) {
    const source = read(file);
    assert.match(source, /environment: cloudflare-staging/);
  }

  const productionFiles = [
    ".github/workflows/environment-secrets-audit.yml",
    ".github/workflows/production-readiness.yml",
    ".github/workflows/cloudflare-production-prepare.yml",
    ".github/workflows/shopify-production-candidate.yml",
    ".github/workflows/shopify-production-release.yml",
  ];
  for (const file of productionFiles) {
    const source = read(file);
    assert.match(source, /environment: cloudflare-production/);
  }
});


test("Shopify app identities match the VSN Metafields-style model", () => {
  const local = read("shopify.app.toml");
  const staging = read("shopify.app.staging.toml");
  const production = read("shopify.app.production.toml");
  const audit = read(".github/workflows/environment-secrets-audit.yml");
  const readiness = read(".github/workflows/production-readiness.yml");
  const candidate = read(".github/workflows/shopify-production-candidate.yml");
  const release = read(".github/workflows/shopify-production-release.yml");

  const clientId = (source) =>
    source.match(/^client_id = "([^"]+)"$/m)?.[1];

  const localId = clientId(local);
  const stagingId = clientId(staging);
  const productionId = clientId(production);

  assert.ok(localId);
  assert.equal(stagingId, "__SHOPIFY_STAGING_CLIENT_ID__");
  assert.ok(productionId);
  assert.notEqual(productionId, "__SHOPIFY_PRODUCTION_CLIENT_ID__");
  assert.notEqual(localId, productionId);

  assert.match(local, /name = "VSN \| Stock Down Sort Dev"/);
  assert.match(staging, /name = "VSN \| Stock Down Sort Staging"/);
  assert.match(production, /name = "VSN \| Stock Down Sort"/);

  for (const workflow of [audit, readiness, candidate, release]) {
    assert.match(workflow, /committed Live Shopify client ID/);
    assert.doesNotMatch(workflow, /__SHOPIFY_PRODUCTION_CLIENT_ID__/);
  }

  assert.doesNotMatch(candidate, /Inject Live client ID into disposable checkout/);
  assert.doesNotMatch(release, /Inject Live client ID into disposable checkout/);
});


test("Local Dev runner is Windows-safe", () => {
  const runner = read("scripts/local-dev-runner.mjs");

  assert.match(runner, /shell: process\.platform === "win32"/);
  assert.doesNotMatch(runner, /\.cmd`/);
  assert.match(runner, /run\("npx"/);
  assert.match(runner, /run\("npm"/);
});


test("embedded Shopify auth uses online tokens", () => {
  const shopify = read("app/shopify.server.ts");

  assert.match(shopify, /distribution: AppDistribution\.AppStore/);
  assert.match(shopify, /useOnlineTokens:\s*true/);
  assert.match(shopify, /authPathPrefix:\s*"\/auth"/);
});


test("billing gate preserves embedded Shopify auth context", () => {
  const app = read("app/routes/app.tsx");

  assert.match(
    app,
    /const \{ admin, redirect: shopifyRedirect \} = await authenticate\.admin\(request\)/,
  );
  assert.match(app, /return shopifyRedirect\("\/app\/plans"\)/);
  assert.doesNotMatch(app, /throw redirect\(/);
  assert.doesNotMatch(app, /new URLSearchParams\(\)/);
});


test("Staging Readiness reads the canonical top-level billing catalog", () => {
  const readiness = read(".github/workflows/staging-readiness.yml");

  assert.match(readiness, /billing = product/);
  assert.match(readiness, /plans = product\.get\("plans"\) or \[\]/);
  assert.doesNotMatch(readiness, /product\.get\("billing"\)/);
});


test("staging bootstrap deploy is separated from signed Shopify acceptance", () => {
  const deploy = read(".github/workflows/cloudflare-staging-deploy.yml");
  const acceptance = read(".github/workflows/staging-runtime-acceptance.yml");
  const plan = JSON.parse(read("config/ai/execution-plan.json"));
  const gates = JSON.parse(read("config/release/environment-gates.json"));

  assert.doesNotMatch(deploy, /staging_shop:/);
  assert.doesNotMatch(deploy, /billing_plan_id:/);
  assert.doesNotMatch(deploy, /Verify Shopify session and subscription reads/);
  assert.match(deploy, /staging_shopify_acceptance=deferred_to_staging_runtime_acceptance_workflow/);

  assert.match(acceptance, /CERTIFY_STAGING_RUNTIME/);
  assert.match(acceptance, /staging_shop:/);
  assert.match(acceptance, /billing_plan_id:/);
  assert.match(acceptance, /staging\.get\("deployed_source_ref"\)/);
  assert.match(acceptance, /Verify signed Shopify session and subscription reads/);

  const wu05 = plan.work_units.find((workUnit) => workUnit.id === "ISSUE-32-WU-05");
  const wu06 = plan.work_units.find((workUnit) => workUnit.id === "ISSUE-32-WU-06");
  assert.ok(wu06.dependencies.includes("ISSUE-32-WU-04"));
  assert.ok(wu05.dependencies.includes("ISSUE-32-WU-06"));

  assert.equal(gates.staging.status, "accepted");
  assert.equal(gates.staging.accepted_source_ref, gates.local_dev.accepted_source_ref);
  assert.equal(
    gates.staging.accepted_main_ref,
    "54c66ab35734efdc929212eb4c676eb062086e64",
  );
  assert.equal(gates.staging.evidence_record?.run_id, 37140631538);
  assert.equal(gates.staging.evidence_record?.accepted_main_ref_recording, "recorded");
  assert.equal(
    gates.staging.evidence_record?.accepted_main_ref,
    gates.staging.accepted_main_ref,
  );
  assert.equal(gates.staging.evidence_record?.offline_shopify_session, "passed");
  assert.equal(gates.staging.evidence_record?.admin_graphql, "passed");
  assert.equal(gates.staging.evidence_record?.subscription_read, "passed");
  assert.equal(gates.staging.deployment_record?.run_id, 37138271737);
  assert.equal(gates.staging.shopify_release_record?.version, "stock-down-sort-staging-5df0cb94446e-2");
});



