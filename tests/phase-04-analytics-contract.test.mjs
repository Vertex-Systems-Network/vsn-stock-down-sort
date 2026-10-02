import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("PHASE-04 ActivityEvent persistence is mirrored across Local and hosted schemas", () => {
  const local = read("prisma/schema.prisma");
  const cloud = read("prisma/cloud/schema.prisma");

  for (const source of [local, cloud]) {
    assert.match(source, /model ActivityEvent\b/);
    assert.match(source, /shop\s+String/);
    assert.match(source, /category\s+String/);
    assert.match(source, /action\s+String/);
    assert.match(source, /outcome\s+String/);
    assert.match(source, /source\s+String/);
    assert.match(source, /totalProducts\s+Int\?/);
    assert.match(source, /soldOutProducts\s+Int\?/);
    assert.match(source, /movedProducts\s+Int\?/);
    assert.match(source, /@@index\(\[shop, occurredAt\]\)/);
    assert.match(source, /@@index\(\[shop, category, occurredAt\]\)/);
    assert.match(source, /@@index\(\[shop, action, occurredAt\]\)/);
  }
});

test("PHASE-04 analytics service is shop-scoped, bounded and entitlement-gated", () => {
  const shared = read("app/services/analytics.ts");
  const server = read("app/services/analytics.server.ts");

  for (const optionId of [
    "OPT-ANALYTICS",
    "OPT-ACTIVITY-HISTORY",
    "OPT-CSV-EXPORT",
  ]) {
    assert.ok(shared.includes(optionId), optionId);
  }

  assert.ok(server.includes("db.activityEvent.create"));
  assert.ok(server.includes("db.activityEvent.findMany"));
  assert.match(server, /where:\s*\{\s*shop,/);
  assert.ok(server.includes("MAX_ANALYTICS_ROWS = 5000"));
  assert.ok(server.includes("MAX_CSV_ROWS = 5000"));
  assert.ok(server.includes("assertPhase4Entitlement"));
  assert.ok(server.includes("retentionDays"));
  assert.ok(server.includes("activityHistoryToCsv"));
});

test("sorting and visibility engines persist real runtime activity", () => {
  const sorter = read("app/services/collection-sorter.server.ts");
  const visibility = read("app/services/product-visibility.server.ts");

  for (const required of [
    "recordActivityEventSafe",
    'action: "collection.sorted"',
    'action: "collection.sort_failed"',
    'action: "collection.rules_saved"',
    'action: "collection.enabled"',
    'action: "collection.disabled"',
  ]) {
    assert.ok(sorter.includes(required), required);
  }

  assert.ok(visibility.includes("recordActivityEventSafe"));
  assert.ok(visibility.includes("product."));
  assert.ok(visibility.includes('action: "product.restored"'));
  assert.ok(visibility.includes('action: "visibility.settings_saved"'));
});

test("analytics UI and CSV export authenticate Shopify and use persisted shop data", () => {
  const route = read("app/routes/app.analytics.tsx");
  const csv = read("app/routes/app.analytics.export.tsx");
  const nav = read("app/routes/app.tsx");

  assert.ok(route.includes("authenticate.admin(request)"));
  assert.ok(route.includes("getCurrentSubscriptionPlan"));
  assert.ok(route.includes("getAutomationAnalytics(session.shop"));
  assert.ok(route.includes("getActivityHistory(session.shop"));
  assert.ok(route.includes("No runtime activity has been recorded"));
  assert.ok(route.includes("Export activity CSV"));

  assert.ok(csv.includes("authenticate.admin(request)"));
  assert.match(csv, /getCsvActivityHistory\(\s*session\.shop/);
  assert.ok(csv.includes("Content-Disposition"));
  assert.ok(csv.includes('"Cache-Control": "private, no-store"'));
  assert.ok(csv.includes("recordActivityEventSafe"));

  assert.ok(nav.includes("/app/analytics"));
});

test("PHASE-04 capabilities are available only on plans that include them", () => {
  const productPlan = JSON.parse(read("config/ai/product-plan.json"));
  const optionsBank = JSON.parse(read("config/ai/options-bank.json"));
  const phase4Ids = [
    "OPT-ANALYTICS",
    "OPT-ACTIVITY-HISTORY",
    "OPT-CSV-EXPORT",
  ];

  for (const optionId of phase4Ids) {
    assert.equal(
      productPlan.runtime_implemented_option_ids.includes(optionId),
      true,
      optionId,
    );
    const option = optionsBank.options.find((item) => item.id === optionId);
    assert.ok(option, optionId);
    assert.equal(option.runtime_status, "implemented", optionId);
  }

  const plans = Object.fromEntries(
    productPlan.plans.map((plan) => [plan.id, plan]),
  );

  for (const optionId of phase4Ids) {
    assert.equal(plans.starter.option_ids.includes(optionId), false, optionId);
    assert.equal(plans.growth.option_ids.includes(optionId), false, optionId);
    assert.equal(plans.pro.option_ids.includes(optionId), true, optionId);
    assert.equal(plans.unlimited.option_ids.includes(optionId), true, optionId);
  }
});
