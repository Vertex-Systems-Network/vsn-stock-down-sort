import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("PHASE-09 support catalog mapping is exact and priority entitlement is Pro plus Unlimited only", () => {
  const plan = JSON.parse(read("config/ai/product-plan.json"));
  const options = JSON.parse(read("config/ai/options-bank.json"));
  const support = read("app/services/support.ts");

  const byId = Object.fromEntries(
    plan.plans.map((item) => [item.id, item]),
  );

  assert.equal(byId.starter.support, "standard");
  assert.equal(byId.growth.support, "standard");
  assert.equal(byId.pro.support, "priority");
  assert.equal(byId.unlimited.support, "24/7 priority");

  assert.equal(
    byId.starter.option_ids.includes("OPT-PRIORITY-SUPPORT"),
    false,
  );
  assert.equal(
    byId.growth.option_ids.includes("OPT-PRIORITY-SUPPORT"),
    false,
  );
  assert.equal(
    byId.pro.option_ids.includes("OPT-PRIORITY-SUPPORT"),
    true,
  );
  assert.equal(
    byId.unlimited.option_ids.includes("OPT-PRIORITY-SUPPORT"),
    true,
  );

  assert.equal(
    plan.runtime_implemented_option_ids.includes("OPT-PRIORITY-SUPPORT"),
    true,
  );
  assert.equal(
    options.options.find(
      (item) => item.id === "OPT-PRIORITY-SUPPORT",
    )?.runtime_status,
    "implemented",
  );

  assert.ok(support.includes('starter: "standard"'));
  assert.ok(support.includes('growth: "standard"'));
  assert.ok(support.includes('pro: "priority"'));
  assert.ok(support.includes('unlimited: "24/7 priority"'));
});

test("support resolver fails closed on catalog or option mapping drift", () => {
  const support = read("app/services/support.ts");

  assert.ok(support.includes("SUPPORT_CATALOG_BY_PLAN"));
  assert.ok(support.includes("actualSupport !== expectedSupport"));
  assert.ok(support.includes("Priority support option mapping is invalid"));
  assert.ok(support.includes('tier: "STANDARD"'));
  assert.ok(support.includes('tier: "PRIORITY"'));
  assert.ok(support.includes('tier: "PRIORITY_24_7"'));
  assert.ok(support.includes('label: "Standard support"'));
  assert.ok(support.includes('label: "Priority support"'));
  assert.ok(support.includes('label: "24/7 priority support"'));
});

test("Plans page no longer implies 24/7 support for every plan", () => {
  const route = read("app/routes/app.plans.tsx");

  assert.ok(route.includes("resolveSupportEntitlement(plan)"));
  assert.ok(route.includes("Support included"));
  assert.ok(route.includes("{support.label}"));
  assert.equal(
    route.includes('<s-badge tone="info">24/7 support</s-badge>'),
    false,
  );
  assert.equal(
    route.includes("Unlimited products · unlimited collections · {plan.support}"),
    false,
  );
});

test("Support page derives entitlement from authenticated current plan and states operational boundary", () => {
  const route = read("app/routes/app.support.tsx");
  const nav = read("app/routes/app.tsx");

  assert.ok(route.includes("authenticate.admin(request)"));
  assert.ok(route.includes("getCurrentSubscriptionPlan(admin)"));
  assert.ok(route.includes("resolveSupportEntitlement(current.plan)"));
  assert.ok(route.includes("standard support entitlement"));
  assert.ok(route.includes("priority support entitlement"));
  assert.ok(route.includes("24/7 priority"));
  assert.ok(route.includes("Operational boundary"));
  assert.ok(route.includes("does not define or publish a response-time SLA"));
  assert.ok(route.includes("support contact"));
  assert.ok(route.includes("staffing commitment"));
  assert.equal(route.includes("<form"), false);
  assert.ok(nav.includes("/app/support"));
});

test("PHASE-09 closes the selected capability catalog without inventing support operations", () => {
  const plan = JSON.parse(read("config/ai/product-plan.json"));
  const options = JSON.parse(read("config/ai/options-bank.json"));
  const selected = options.options.filter(
    (item) => item.status === "selected",
  );
  const implemented = new Set(plan.runtime_implemented_option_ids);

  for (const option of selected) {
    assert.notEqual(
      option.runtime_status,
      "planned",
      option.id,
    );
    if (option.runtime_status === "implemented") {
      assert.equal(implemented.has(option.id), true, option.id);
    }
  }

  const route = read("app/routes/app.support.tsx");
  assert.equal(route.includes("response within"), false);
  assert.equal(route.includes("guaranteed response"), false);
  assert.equal(route.includes("support@example"), false);
  assert.equal(route.includes("mailto:"), false);
});
