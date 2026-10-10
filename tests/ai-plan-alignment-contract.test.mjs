import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");
const json = (path) => JSON.parse(read(path));

const productPlan = json("config/ai/product-plan.json");
const optionsBank = json("config/ai/options-bank.json");
const modulesBank = json("config/ai/modules-bank.json");

const REQUIRED_SCOPES = [
  "read_products",
  "write_products",
  "read_inventory",
  "read_locations",
];

const OPTION_EVIDENCE = {
  "OPT-UNLIMITED-CATALOGS": [
    ["app/services/collection-sorter.server.ts", "export async function listAllCollections"],
    ["app/services/collection-sorter.server.ts", "hasNextPage"],
  ],
  "OPT-SOLD-OUT-PUSH-DOWN": [
    ["app/services/collection-sorter.server.ts", "const soldOut ="],
    ["app/services/collection-sorter.server.ts", "orderedMovable = [...pinned, ...available, ...soldOut]"],
  ],
  "OPT-REALTIME-RESORT": [
    ["app/routes/webhooks.inventory-levels-update.tsx", "sortEnabledCollections"],
    ["app/routes/webhooks.products-update.tsx", "sortEnabledCollections"],
  ],
  "OPT-RESTORE-ORIGINAL-POSITION": [
    ["app/services/collection-sorter.server.ts", "previousSortOrder"],
    ["app/services/collection-sorter.server.ts", "restorePreviousSort"],
  ],
  "OPT-MANUAL-BULK-SORT": [
    ["app/routes/app._index.tsx", 'intent === "sort"'],
    ["app/routes/app._index.tsx", 'intent === "enableAll"'],
    ["app/routes/app._index.tsx", 'intent === "disableAll"'],
  ],
  "OPT-TAG-EXCLUSIONS": [
    ["app/services/collection-sort-rules.ts", "OPT-TAG-EXCLUSIONS"],
  ],
  "OPT-PINNED-PRODUCTS": [
    ["app/services/collection-sort-rules.ts", "OPT-PINNED-PRODUCTS"],
  ],
  "OPT-ADVANCED-SORT-RULES": [
    ["app/services/collection-sort-rules.ts", "OPT-ADVANCED-SORT-RULES"],
  ],
  "OPT-MULTI-LOCATION": [
    ["app/services/collection-sort-rules.ts", "OPT-MULTI-LOCATION"],
    ["scripts/local-env.mjs", '"read_locations"'],
  ],
  "OPT-AUTO-HIDE-PRODUCTS": [
    ["app/services/product-visibility.ts", "OPT-AUTO-HIDE-PRODUCTS"],
  ],
  "OPT-AUTO-REPUBLISH": [
    ["app/services/product-visibility.ts", "OPT-AUTO-REPUBLISH"],
  ],
  "OPT-SEO-SAFE-HIDE": [
    ["app/services/product-visibility.ts", "OPT-SEO-SAFE-HIDE"],
  ],
  "OPT-HIDE-SOLD-OUT-VARIANTS": [
    ["app/services/product-visibility.ts", "OPT-HIDE-SOLD-OUT-VARIANTS"],
    ["extensions/vsn-variant-visibility/blocks/variant-visibility.liquid", "variant"],
  ],
  "OPT-VARIANT-RESTORE": [
    ["app/services/product-visibility.ts", "OPT-VARIANT-RESTORE"],
    ["extensions/vsn-variant-visibility/blocks/variant-visibility.liquid", "available"],
  ],
  "OPT-ANALYTICS": [
    ["app/services/analytics.ts", "OPT-ANALYTICS"],
  ],
  "OPT-ACTIVITY-HISTORY": [
    ["app/services/analytics.ts", "OPT-ACTIVITY-HISTORY"],
  ],
  "OPT-CSV-EXPORT": [
    ["app/services/analytics.ts", "OPT-CSV-EXPORT"],
    ["app/routes/app.analytics.export.tsx", "text/csv"],
  ],
  "OPT-SCHEDULED-AUTOMATION": [
    ["app/services/automation.ts", "OPT-SCHEDULED-AUTOMATION"],
    ["app/routes/internal.run-schedules.tsx", "automation"],
  ],
  "OPT-RULE-BUILDER": [
    ["app/services/automation.ts", "OPT-RULE-BUILDER"],
  ],
  "OPT-LOW-STOCK-EMAIL": [
    ["app/services/alerts.ts", "OPT-LOW-STOCK-EMAIL"],
  ],
  "OPT-SLACK-ALERTS": [
    ["app/services/alerts.ts", "OPT-SLACK-ALERTS"],
  ],
  "OPT-MARKETS": [
    ["app/services/context-visibility.ts", "OPT-MARKETS"],
  ],
  "OPT-B2B-CATALOGS": [
    ["app/services/context-visibility.ts", "OPT-B2B-CATALOGS"],
  ],
  "OPT-SALES-CHANNEL-RULES": [
    ["app/services/context-visibility.ts", "OPT-SALES-CHANNEL-RULES"],
  ],
  "OPT-API-INTEGRATIONS": [
    ["app/services/integrations.ts", "OPT-API-INTEGRATIONS"],
    ["app/routes/api.v1.activity.tsx", "authenticate"],
  ],
  "OPT-PRIORITY-SUPPORT": [
    ["app/services/support.ts", "OPT-PRIORITY-SUPPORT"],
    ["app/routes/app.support.tsx", "support"],
  ],
};

test("AI plan option catalog is complete, implemented and assigned", () => {
  const runtimeIds = new Set(productPlan.runtime_implemented_option_ids);
  const optionIds = new Set(optionsBank.options.map((option) => option.id));
  const assignedIds = new Set(
    productPlan.plans.flatMap((plan) => plan.option_ids),
  );

  assert.equal(runtimeIds.size, 26);
  assert.deepEqual([...runtimeIds].sort(), [...optionIds].sort());
  assert.deepEqual([...runtimeIds].sort(), [...assignedIds].sort());

  for (const option of optionsBank.options) {
    assert.equal(option.status, "selected", option.id);
    assert.equal(option.runtime_status, "implemented", option.id);
  }
});

test("four plan hierarchy stays monotonic and matches the approved commercial contract", () => {
  const expected = [
    ["starter", 10.99, 30, "standard"],
    ["growth", 19.99, 90, "standard"],
    ["pro", 34.99, 365, "priority"],
    ["unlimited", 70, null, "24/7 priority"],
  ];

  assert.deepEqual(productPlan.plans.map((plan) => [
    plan.id,
    plan.amount,
    plan.history_retention_days,
    plan.support,
  ]), expected);

  for (const plan of productPlan.plans) {
    assert.equal(plan.trial_days, 10, plan.id);
    assert.equal(plan.catalog_limits.products, "unlimited", plan.id);
    assert.equal(plan.catalog_limits.collections, "unlimited", plan.id);
  }

  for (let index = 1; index < productPlan.plans.length; index += 1) {
    const previous = new Set(productPlan.plans[index - 1].option_ids);
    const current = new Set(productPlan.plans[index].option_ids);
    for (const optionId of previous) {
      assert.ok(current.has(optionId), `${productPlan.plans[index].id} lost ${optionId}`);
    }
  }
});

test("every runtime option has module ownership, billing ownership, documentation and source evidence", () => {
  const runtimeIds = productPlan.runtime_implemented_option_ids;
  const moduleCoverage = new Map();

  for (const module of modulesBank.modules) {
    for (const optionId of module.option_ids ?? []) {
      const owners = moduleCoverage.get(optionId) ?? [];
      owners.push(module.id);
      moduleCoverage.set(optionId, owners);
    }
  }

  const billingModule = modulesBank.modules.find(
    (module) => module.id === "MOD-BILLING",
  );
  assert.ok(billingModule);
  assert.deepEqual(
    [...billingModule.option_ids].sort(),
    [...runtimeIds].sort(),
  );

  const docs = read("app/routes/app.documentation.tsx");
  const optionById = new Map(
    optionsBank.options.map((option) => [option.id, option]),
  );

  for (const optionId of runtimeIds) {
    assert.ok(moduleCoverage.has(optionId), `module ownership missing for ${optionId}`);
    assert.ok(OPTION_EVIDENCE[optionId], `source evidence map missing for ${optionId}`);
    const option = optionById.get(optionId);
    assert.ok(option);
    assert.ok(docs.includes(option.name), `documentation missing ${option.name}`);

    for (const [path, marker] of OPTION_EVIDENCE[optionId]) {
      assert.ok(
        read(path).includes(marker),
        `${optionId} evidence missing: ${path} :: ${marker}`,
      );
    }
  }
});

test("Shopify app identities declare required and optional scopes consistently", () => {
  for (const path of [
    "shopify.app.local.toml",
    "shopify.app.staging.toml",
    "shopify.app.production.toml",
  ]) {
    const config = read(path);
    for (const scope of REQUIRED_SCOPES) {
      assert.ok(config.includes(scope), `${path} missing required ${scope}`);
    }
    assert.match(
      config,
      /optional_scopes = \["read_publications", "write_publications"\]/,
      `${path} missing optional publication scopes`,
    );
  }

  const workflow = read(".github/workflows/app-validation.yml");
  for (const scope of REQUIRED_SCOPES) {
    assert.ok(workflow.includes(scope), `App Validation SCOPES missing ${scope}`);
  }
  assert.doesNotMatch(
    workflow,
    /SCOPES:[^\n]*(?:read_publications|write_publications)/,
  );
});

test("baseline plan options contain implementation and QA evidence in the AI option bank", () => {
  const baselineIds = [
    "OPT-UNLIMITED-CATALOGS",
    "OPT-SOLD-OUT-PUSH-DOWN",
    "OPT-REALTIME-RESORT",
    "OPT-RESTORE-ORIGINAL-POSITION",
    "OPT-MANUAL-BULK-SORT",
  ];
  const optionById = new Map(
    optionsBank.options.map((option) => [option.id, option]),
  );

  for (const optionId of baselineIds) {
    const option = optionById.get(optionId);
    assert.ok(option);
    assert.ok(option.technical_implications.length > 0, optionId);
    assert.ok(option.qa_implications.length > 0, optionId);
  }
});
