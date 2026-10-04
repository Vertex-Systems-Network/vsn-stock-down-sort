import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");
const json = (path) => JSON.parse(read(path));

test("Shopify App Pricing is the public submission target with legacy compatibility", () => {
  const strategy = json("config/shopify/billing-strategy.json");
  assert.equal(strategy.active_method, "shopify_app_pricing");
  assert.equal(
    strategy.repository_mode,
    "dual_compatibility_until_legacy_migration",
  );
  assert.equal(
    strategy.partner_dashboard_required_pricing_method,
    "shopify_app_pricing",
  );
  assert.equal(strategy.runtime.target_value, "shopify_app_pricing");
  assert.equal(
    strategy.manual_pricing_legacy_compatibility.new_subscription_creation_allowed,
    "local_and_staging_only",
  );
  assert.equal(strategy.environment_billing.local_dev.mode, "manual_legacy");
  assert.equal(strategy.environment_billing.local_dev.billing_test_mode, true);
  assert.equal(strategy.environment_billing.staging.mode, "manual_legacy");
  assert.equal(strategy.environment_billing.staging.billing_test_mode, true);
  assert.equal(
    strategy.environment_billing.production_live.mode,
    "shopify_app_pricing",
  );
  assert.equal(
    strategy.environment_billing.production_live.app_gid,
    "gid://shopify/App/405802811393",
  );
  assert.equal(
    strategy.shopify_app_pricing_migration.status,
    "repository_ready_dashboard_configuration_pending",
  );
});

test("Partner API Active Subscription integration fails closed and resolves catalog pricing", () => {
  const source = read("app/services/shopify-app-pricing.server.ts");
  for (const marker of [
    "activeSubscription(appId: $appId, shopId: $shopId)",
    "SHOPIFY_PARTNER_ORG_ID",
    "SHOPIFY_PARTNER_API_ACCESS_TOKEN",
    "SHOPIFY_APP_GID",
    "X-Shopify-Access-Token",
    "Shopify Partner API activeSubscription request failed",
    "resolveShopifyAppPricingPlan",
    "/pricing_plans",
  ]) {
    assert.ok(source.includes(marker), marker);
  }
  assert.ok(source.includes('if (!response.ok)'));
  assert.ok(source.includes('throw new Error'));
});

test("unified subscription truth prefers App Pricing and preserves Billing API fallback", () => {
  const billing = read("app/services/billing.server.ts");
  assert.ok(billing.includes("getShopifyAppPricingSubscription"));
  assert.ok(billing.includes("resolveShopifyAppPricingPlan"));
  assert.ok(billing.includes('source: "shopify_app_pricing" as const'));
  assert.ok(billing.includes("getCurrentManualSubscription"));
  assert.ok(billing.includes("const managed = await getShopifyAppPricingSubscription(admin)"));
  assert.ok(billing.indexOf("const managed = await getShopifyAppPricingSubscription(admin)") < billing.indexOf("const subscription = await getCurrentManualSubscription(admin)"));
});

test("new subscriptions use Shopify hosted pricing when App Pricing mode is enabled", () => {
  const route = read("app/routes/app.api.subscription.tsx");
  assert.ok(route.includes("isShopifyAppPricingMode()"));
  assert.ok(route.includes("getShopifyAppPricingPlanSelectionUrl"));
  assert.ok(route.includes('"shopify_app_pricing"'));
  assert.ok(route.includes("Migrate that subscription to Shopify App Pricing before changing plans."));
  assert.ok(route.includes("createSubscription("));
  assert.ok(
    route.indexOf("if (isShopifyAppPricingMode())") <
      route.indexOf("const result = await createSubscription("),
  );
});

test("plan UI blocks unsafe manual-to-App-Pricing switches", () => {
  const plans = read("app/routes/app.plans.tsx");
  assert.ok(plans.includes("manualMigrationRequired"));
  assert.ok(plans.includes("Billing migration required."));
  assert.ok(plans.includes("Choose in Shopify"));
  assert.ok(plans.includes('current?.source !== "shopify_app_pricing"'));
});

test("billing modes are isolated across Staging and Live", () => {
  const staging = JSON.parse(read("wrangler.staging.jsonc"));
  const production = JSON.parse(read("wrangler.production.jsonc"));

  assert.equal(staging.vars.SHOPIFY_BILLING_MODE, "manual_legacy");
  assert.equal(staging.vars.SHOPIFY_BILLING_TEST_MODE, "true");
  assert.equal(staging.vars.SHOPIFY_PARTNER_ORG_ID, undefined);
  assert.equal(staging.vars.SHOPIFY_APP_GID, undefined);
  assert.ok(
    !staging.secrets.required.includes("SHOPIFY_PARTNER_API_ACCESS_TOKEN"),
  );

  assert.equal(production.vars.SHOPIFY_BILLING_MODE, "shopify_app_pricing");
  assert.equal(production.vars.SHOPIFY_BILLING_TEST_MODE, "false");
  assert.equal(production.vars.SHOPIFY_PARTNER_ORG_ID, "4859256");
  assert.equal(
    production.vars.SHOPIFY_APP_GID,
    "gid://shopify/App/405802811393",
  );
  assert.ok(
    production.secrets.required.includes("SHOPIFY_PARTNER_API_ACCESS_TOKEN"),
  );

  for (const path of [
    ".github/workflows/cloudflare-staging-deploy.yml",
    ".github/workflows/staging-readiness.yml",
    ".github/workflows/staging-runtime-acceptance.yml",
  ]) {
    const source = read(path);
    assert.ok(source.includes("SHOPIFY_BILLING_MODE: manual_legacy"), path);
    assert.equal(source.includes("SHOPIFY_PARTNER_API_ACCESS_TOKEN"), false, path);
  }

  for (const path of [
    ".github/workflows/cloudflare-production-prepare.yml",
    ".github/workflows/production-readiness.yml",
    ".github/workflows/final-production-merchant-smoke.yml",
  ]) {
    const source = read(path);
    assert.ok(source.includes("shopify_app_pricing"), path);
  }
});

test("runtime acceptance uses unified subscription truth and final production smoke is guarded", () => {
  const staging = read("app/routes/internal.staging-acceptance.tsx");
  const production = read("app/routes/internal.production-acceptance.tsx");
  const workflow = read(".github/workflows/final-production-merchant-smoke.yml");

  assert.ok(staging.includes("getCurrentSubscriptionPlan"));
  assert.ok(staging.includes("getShopifyBillingMode"));
  assert.ok(production.includes("getCurrentSubscriptionPlan"));
  assert.ok(production.includes("getShopifyBillingMode"));

  assert.ok(workflow.includes("CERTIFY_PRODUCTION_MERCHANT"));
  assert.ok(workflow.includes("/internal/production-acceptance"));
  assert.ok(workflow.includes('billingMethod") != "shopify_app_pricing"'));
  assert.ok(workflow.includes('subscriptions.get("source") != "shopify_app_pricing"'));

  const stagingWorkflow = read(".github/workflows/staging-runtime-acceptance.yml");
  assert.ok(stagingWorkflow.includes("SHOPIFY_BILLING_MODE: manual_legacy"));
  assert.ok(stagingWorkflow.includes('billingMethod") != "manual_legacy"'));
});

test("App Store submission record matches the canonical four-plan catalog", () => {
  const submission = json("config/shopify/app-store-submission.json");
  const product = json("config/ai/product-plan.json");

  assert.equal(submission.pricing_method, "shopify_app_pricing");
  assert.equal(submission.welcome_link, "/app");
  assert.equal(submission.public_plans.length, 4);
  assert.deepEqual(
    submission.public_plans.map((plan) => ({
      id: plan.id,
      amount: plan.monthly_charge_usd,
      trial: plan.free_trial_days,
    })),
    product.plans.map((plan) => ({
      id: plan.id,
      amount: plan.amount,
      trial: plan.trial_days,
    })),
  );
  assert.ok(
    submission.external_gates.some(
      (gate) => gate.id === "final_merchant_smoke" && gate.status === "pending",
    ),
  );
});


test("Live App Pricing audit targets the Live app on a Partner development store", () => {
  const workflow = read(".github/workflows/shopify-live-app-pricing-audit.yml");

  for (const marker of [
    'SHOPIFY_PARTNER_ORG_ID: "4859256"',
    'SHOPIFY_APP_GID: "gid://shopify/App/405802811393"',
    "activeSubscription(appId: $appId, shopId: $shopId)",
    "trialDays",
    "EVERY_30_DAYS",
    '"starter": 10.99',
    '"growth": 19.99',
    '"pro": 34.99',
    '"unlimited": 70.00',
    "live_app_pricing_audit=pass",
    "Partner development store domain",
  ]) {
    assert.ok(workflow.includes(marker), marker);
  }

  assert.ok(workflow.includes("events("));
  assert.ok(workflow.includes("FlatRatePlanPrice"));
  assert.ok(workflow.includes("FlatRatePrice"));
  assert.ok(workflow.includes("SHOPIFY_PARTNER_API_ACCESS_TOKEN"));
  assert.ok(workflow.includes("environment: cloudflare-production"));
  assert.ok(workflow.includes("ref: main"));
  assert.ok(workflow.includes("effective_amount - 0.0"));
  assert.ok(workflow.includes("live_app_pricing_no_charge_test=pass"));
  assert.ok(workflow.includes("live_app_pricing_catalog_price=pass"));
  assert.ok(workflow.includes("effective_amount="));
  assert.ok(workflow.includes("catalog_amount="));
});

test("Staging App Pricing audit is retired because pricing belongs to Live", () => {
  assert.equal(
    fs.existsSync(".github/workflows/shopify-app-pricing-staging-audit.yml"),
    false,
  );
  const staging = read("wrangler.staging.jsonc");
  assert.equal(staging.includes("shopify_app_pricing"), false);
  assert.equal(staging.includes("SHOPIFY_PARTNER_API_ACCESS_TOKEN"), false);
});
