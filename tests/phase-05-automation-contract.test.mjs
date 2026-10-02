import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("PHASE-05 AutomationRule persistence is mirrored across Local and hosted schemas", () => {
  const local = read("prisma/schema.prisma");
  const cloud = read("prisma/cloud/schema.prisma");

  for (const source of [local, cloud]) {
    assert.match(source, /model AutomationRule\b/);
    assert.match(source, /shop\s+String/);
    assert.match(source, /collectionId\s+String/);
    assert.match(source, /scheduleMinutes\s+Int\?/);
    assert.match(source, /minSoldOutProducts\s+Int\?/);
    assert.match(source, /minSoldOutPercent\s+Int\?/);
    assert.match(source, /minTotalProducts\s+Int\?/);
    assert.match(source, /nextRunAt\s+DateTime\?/);
    assert.match(source, /leaseUntil\s+DateTime\?/);
    assert.match(source, /@@index\(\[shop, enabled, nextRunAt\]\)/);
    assert.match(source, /@@index\(\[shop, collectionId\]\)/);
  }
});

test("PHASE-05 capability entitlements match the commercial plan tiers", () => {
  const plan = JSON.parse(read("config/ai/product-plan.json"));
  const options = JSON.parse(read("config/ai/options-bank.json"));
  const implemented = new Set(plan.runtime_implemented_option_ids);

  for (const optionId of [
    "OPT-SCHEDULED-AUTOMATION",
    "OPT-RULE-BUILDER",
  ]) {
    assert.equal(implemented.has(optionId), true, optionId);
    assert.equal(
      options.options.find((option) => option.id === optionId)?.runtime_status,
      "implemented",
      optionId,
    );
  }

  const byId = Object.fromEntries(plan.plans.map((item) => [item.id, item]));

  assert.equal(
    byId.starter.option_ids.includes("OPT-SCHEDULED-AUTOMATION"),
    false,
  );
  assert.equal(
    byId.growth.option_ids.includes("OPT-SCHEDULED-AUTOMATION"),
    true,
  );
  assert.equal(
    byId.growth.option_ids.includes("OPT-RULE-BUILDER"),
    false,
  );
  assert.equal(byId.pro.option_ids.includes("OPT-RULE-BUILDER"), true);
  assert.equal(
    byId.unlimited.option_ids.includes("OPT-RULE-BUILDER"),
    true,
  );
});

test("automation engine evaluates live stock and uses the certified sort engine", () => {
  const contract = read("app/services/automation.ts");
  const server = read("app/services/automation.server.ts");
  const sorter = read("app/services/collection-sorter.server.ts");

  assert.ok(contract.includes("OPT-SCHEDULED-AUTOMATION"));
  assert.ok(contract.includes("OPT-RULE-BUILDER"));
  assert.ok(contract.includes("AUTOMATION_SCHEDULE_MINUTES"));
  assert.ok(contract.includes("assertAutomationRuleEntitlements"));

  assert.ok(server.includes("getCollectionStockSummary"));
  assert.ok(server.includes("sortCollection"));
  assert.ok(server.includes("claimDueAutomationRules"));
  assert.ok(server.includes("leaseUntil"));
  assert.ok(server.includes("updateMany"));
  assert.ok(server.includes("MAX_DUE_RULES_PER_TICK = 25"));
  assert.ok(server.includes("RULE_LEASE_MINUTES = 15"));
  assert.ok(server.includes('outcome: "ENTITLEMENT_BLOCKED"'));
  assert.ok(server.includes('outcome: "SKIPPED"'));
  assert.ok(server.includes('outcome: "SUCCESS"'));

  assert.ok(sorter.includes("getCollectionStockSummary"));
  assert.ok(
    sorter.includes(
      "Enable this collection in VSN Stock Down Sort before using automation rules.",
    ),
  );
});

test("Cloudflare scheduled runtime is explicit, hourly and not exposed as a public route", () => {
  const worker = read("workers/app.js");
  const staging = JSON.parse(read("wrangler.staging.jsonc"));
  const production = JSON.parse(read("wrangler.production.jsonc"));
  const internal = read("app/routes/internal.run-schedules.tsx");

  assert.ok(worker.includes("async scheduled(controller, env, ctx)"));
  assert.ok(worker.includes("/internal/run-schedules"));
  assert.ok(worker.includes("scheduledConsumer: true"));

  assert.deepEqual(staging.triggers?.crons, ["0 * * * *"]);
  assert.deepEqual(production.triggers?.crons, ["0 * * * *"]);

  assert.ok(internal.includes("scheduledConsumer"));
  assert.ok(internal.includes('return new Response("Not found", { status: 404 })'));
  assert.ok(internal.includes("claimDueAutomationRules"));
  assert.ok(internal.includes("unauthenticated.admin(rule.shop)"));
  assert.ok(internal.includes('"scheduled"'));
});

test("Automation UI is authenticated, shop-scoped and only targets enabled collections", () => {
  const route = read("app/routes/app.automation.tsx");
  const nav = read("app/routes/app.tsx");

  assert.ok(route.includes("authenticate.admin(request)"));
  assert.ok(route.includes("getCurrentSubscriptionPlan"));
  assert.ok(route.includes("where: { shop: session.shop, enabled: true }"));
  assert.ok(route.includes("listAutomationRules(session.shop)"));
  assert.ok(route.includes("saveAutomationRule"));
  assert.ok(route.includes("executeAutomationRule"));
  assert.ok(route.includes("setAutomationRuleEnabled"));
  assert.ok(route.includes("deleteAutomationRule"));
  assert.ok(route.includes("Local development only supports manual Run now"));
  assert.ok(route.includes("IF / AND conditions"));
  assert.ok(nav.includes("/app/automation"));
});
