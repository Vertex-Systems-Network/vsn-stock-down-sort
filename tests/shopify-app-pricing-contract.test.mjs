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
    false,
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

test("hosted Workers and promotion workflows carry Partner API configuration", () => {
  const expectedRuntime = {
    "wrangler.staging.jsonc": "gid://shopify/App/430575026177",
    "wrangler.production.jsonc": "gid://shopify/App/405802811393",
  };

  for (const [path, appGid] of Object.entries(expectedRuntime)) {
    const source = read(path);
    const config = JSON.parse(source);
    assert.equal(config.vars.SHOPIFY_BILLING_MODE, "shopify_app_pricing", path);
    assert.equal(config.vars.SHOPIFY_PARTNER_ORG_ID, "214077920", path);
    assert.equal(config.vars.SHOPIFY_APP_GID, appGid, path);
    assert.ok(
      config.secrets.required.includes("SHOPIFY_PARTNER_API_ACCESS_TOKEN"),
      path + " missing Partner API token secret",
    );
    assert.ok(
      !config.secrets.required.includes("SHOPIFY_PARTNER_ORG_ID"),
      path + " must not treat Partner organization ID as a secret",
    );
    assert.ok(
      !config.secrets.required.includes("SHOPIFY_APP_GID"),
      path + " must not treat App GID as a secret",
    );
  }

  for (const path of [
    ".github/workflows/environment-secrets-audit.yml",
    ".github/workflows/cloudflare-staging-deploy.yml",
    ".github/workflows/cloudflare-production-prepare.yml",
    ".github/workflows/staging-readiness.yml",
    ".github/workflows/production-readiness.yml",
  ]) {
    const source = read(path);
    for (const name of [
      "SHOPIFY_PARTNER_ORG_ID",
      "SHOPIFY_PARTNER_API_ACCESS_TOKEN",
      "SHOPIFY_APP_GID",
    ]) {
      assert.ok(source.includes(name), path + " missing " + name);
    }
    assert.ok(
      source.includes("SHOPIFY_PARTNER_API_ACCESS_TOKEN: ${{ secrets.SHOPIFY_PARTNER_API_ACCESS_TOKEN }}"),
      path + " must secret-back the Partner API token",
    );
    assert.ok(
      !source.includes("SHOPIFY_PARTNER_ORG_ID: ${{ secrets.SHOPIFY_PARTNER_ORG_ID }}"),
      path + " must not secret-back the organization ID",
    );
    assert.ok(
      !source.includes("SHOPIFY_APP_GID: ${{ secrets.SHOPIFY_APP_GID }}"),
      path + " must not secret-back the App GID",
    );
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
