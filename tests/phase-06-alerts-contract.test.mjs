import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("PHASE-06 alert persistence is mirrored across Local and hosted schemas", () => {
  const local = read("prisma/schema.prisma");
  const cloud = read("prisma/cloud/schema.prisma");

  for (const source of [local, cloud]) {
    assert.match(source, /model AlertSetting\b/);
    assert.match(source, /threshold\s+Int/);
    assert.match(source, /cooldownMinutes\s+Int/);
    assert.match(source, /emailEnabled\s+Boolean/);
    assert.match(source, /emailRecipients\s+String/);
    assert.match(source, /slackEnabled\s+Boolean/);
    assert.match(source, /slackWebhookCiphertext\s+String\?/);

    assert.match(source, /model LowStockAlertState\b/);
    assert.match(source, /lastInventory\s+Int\?/);
    assert.match(source, /lastObservedAt\s+DateTime\?/);
    assert.match(source, /lastEmailAlertAt\s+DateTime\?/);
    assert.match(source, /lastSlackAlertAt\s+DateTime\?/);
    assert.match(source, /@@unique\(\[shop, productId\]\)/);
    assert.match(source, /@@index\(\[shop, lastObservedAt\]\)/);
  }
});

test("PHASE-06 entitlement tiers match the commercial catalog", () => {
  const plan = JSON.parse(read("config/ai/product-plan.json"));
  const options = JSON.parse(read("config/ai/options-bank.json"));
  const implemented = new Set(plan.runtime_implemented_option_ids);

  for (const optionId of [
    "OPT-LOW-STOCK-EMAIL",
    "OPT-SLACK-ALERTS",
  ]) {
    assert.equal(implemented.has(optionId), true, optionId);
    assert.equal(
      options.options.find((option) => option.id === optionId)?.runtime_status,
      "implemented",
      optionId,
    );
  }

  const byId = Object.fromEntries(
    plan.plans.map((item) => [item.id, item]),
  );

  for (const planId of ["starter", "growth", "pro", "unlimited"]) {
    assert.equal(
      byId[planId].option_ids.includes("OPT-LOW-STOCK-EMAIL"),
      true,
      planId,
    );
  }

  assert.equal(
    byId.starter.option_ids.includes("OPT-SLACK-ALERTS"),
    false,
  );
  for (const planId of ["growth", "pro", "unlimited"]) {
    assert.equal(
      byId[planId].option_ids.includes("OPT-SLACK-ALERTS"),
      true,
      planId,
    );
  }
});

test("Slack webhook secrets are validated and encrypted at rest", () => {
  const shared = read("app/services/alerts.ts");
  const crypto = read("app/services/secret-crypto.server.ts");
  const server = read("app/services/alerts.server.ts");
  const route = read("app/routes/app.alerts.tsx");

  assert.ok(shared.includes('"hooks.slack.com"'));
  assert.ok(shared.includes('"hooks.slack-gov.com"'));
  assert.ok(shared.includes('url.protocol !== "https:"'));
  assert.ok(shared.includes("^\\/services\\/"));

  assert.ok(crypto.includes('name: "AES-GCM"'));
  assert.ok(crypto.includes("SHOPIFY_API_SECRET"));
  assert.ok(crypto.includes("additionalData"));
  assert.ok(crypto.includes("crypto.getRandomValues"));

  assert.ok(server.includes("encryptSecret("));
  assert.ok(server.includes("decryptSecret("));
  assert.ok(server.includes("slackWebhookCiphertext"));
  assert.ok(server.includes("slackWebhookConfigured"));
  const publicSettingSlice = server.slice(
    server.indexOf("export async function getAlertSetting"),
    server.indexOf("export async function saveAlertSetting"),
  );
  assert.equal(
    /^\s*slackWebhookCiphertext\s*:/m.test(publicSettingSlice),
    false,
  );

  assert.ok(route.includes('type="password"'));
  assert.ok(route.includes("slackWebhookConfigured"));
  assert.ok(route.includes("The secret is never returned to this page."));
});

test("low-stock evaluation is live, cooldown-bound and isolates delivery errors", () => {
  const server = read("app/services/alerts.server.ts");

  assert.ok(server.includes("query ProductForLowStockAlert"));
  assert.ok(server.includes("totalInventory"));
  assert.ok(server.includes("tracksInventory"));
  assert.ok(server.includes("channelDue("));
  assert.ok(server.includes("lastEmailAlertAt"));
  assert.ok(server.includes("lastSlackAlertAt"));
  assert.ok(server.includes('getAppEnvironment() !== "development"'));
  assert.ok(server.includes("if (hosted && emailDue)"));
  assert.ok(server.includes("if (hosted && slackDue"));
  assert.ok(server.includes("Hosted Worker is missing the EMAIL binding."));
  assert.ok(server.includes("Hosted Worker is missing ALERT_FROM_EMAIL."));
  assert.ok(server.includes("recordActivityEventSafe"));
  assert.ok(server.includes('"alerts.low_stock_evaluated_local"'));

  const activityBlock = server.slice(
    server.lastIndexOf("await recordActivityEventSafe({"),
  );
  assert.equal(activityBlock.includes("emailRecipients"), false);
  assert.equal(activityBlock.includes("slackWebhookCiphertext"), false);
});

test("PHASE-06 alerts use hosted Queue jobs and Local direct evaluation", () => {
  const queue = read("app/sort-queue.server.ts");
  const consumer = read("app/routes/internal.queue-sort.tsx");
  const inventoryWebhook = read(
    "app/routes/webhooks.inventory-levels-update.tsx",
  );
  const productWebhook = read(
    "app/routes/webhooks.products-update.tsx",
  );

  assert.ok(queue.includes('kind: "visibility"'));
  assert.ok(queue.includes('kind: "alert"'));
  assert.ok(consumer.includes('job.kind === "visibility" || job.kind === "alert"'));
  assert.ok(consumer.includes('payload.kind === "alert"'));
  assert.ok(consumer.includes("processLowStockAlert("));

  for (const webhook of [inventoryWebhook, productWebhook]) {
    assert.ok(webhook.includes('kind: "alert" as const'));
    assert.ok(webhook.includes("processLowStockAlert("));
    assert.ok(webhook.includes("enqueueSortJobs(context, jobs)"));
  }
});

test("Cloudflare Email Service binding and sender prerequisite are explicit", () => {
  const staging = JSON.parse(read("wrangler.staging.jsonc"));
  const production = JSON.parse(read("wrangler.production.jsonc"));
  const envExample = read(".env.example");

  for (const config of [staging, production]) {
    assert.deepEqual(config.send_email, [{ name: "EMAIL" }]);
    assert.equal(
      config.secrets?.required?.includes("ALERT_FROM_EMAIL"),
      true,
    );
  }

  assert.ok(envExample.includes("ALERT_FROM_EMAIL="));
  assert.ok(envExample.includes("Cloudflare Email Service"));
});

test("Alerts UI is authenticated, plan-aware and never renders stored Slack plaintext", () => {
  const route = read("app/routes/app.alerts.tsx");
  const nav = read("app/routes/app.tsx");

  assert.ok(route.includes("authenticate.admin(request)"));
  assert.ok(route.includes("getCurrentSubscriptionPlan"));
  assert.ok(route.includes("getAlertSetting(session.shop)"));
  assert.ok(route.includes("saveAlertSetting("));
  assert.ok(route.includes("PHASE6_OPTION_IDS.lowStockEmail"));
  assert.ok(route.includes("PHASE6_OPTION_IDS.slackAlerts"));
  assert.ok(route.includes("Cloudflare Email"));
  assert.ok(route.includes("Local development evaluates alert state"));
  assert.equal(route.includes("slackWebhookCiphertext"), false);
  assert.ok(nav.includes("/app/alerts"));
});
