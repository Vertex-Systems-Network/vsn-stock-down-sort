import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const phase2Ids = [
  "OPT-TAG-EXCLUSIONS",
  "OPT-PINNED-PRODUCTS",
  "OPT-ADVANCED-SORT-RULES",
  "OPT-MULTI-LOCATION",
];

test("PHASE-02 rule fields are additive and parity-safe", () => {
  const local = read("prisma/schema.prisma");
  const cloud = read("prisma/cloud/schema.prisma");
  const localMigration = read(
    "prisma/migrations/20261002121500_phase02_sorting_controls/migration.sql",
  );
  const cloudMigration = read(
    "prisma/cloud/migrations/20261002121500_phase02_sorting_controls/migration.sql",
  );

  for (const field of [
    "excludedTags",
    "excludedVendors",
    "excludedProducts",
    "pinnedProducts",
    "availableSortMode",
    "inventoryMode",
    "inventoryLocationIds",
  ]) {
    assert.ok(local.includes(field));
    assert.ok(cloud.includes(field));
    assert.ok(localMigration.includes('"' + field + '"'));
    assert.ok(cloudMigration.includes('"' + field + '"'));
  }

  assert.doesNotMatch(localMigration, /\bDROP\b/i);
  assert.doesNotMatch(cloudMigration, /\bDROP\b/i);
});

test("canonical plans expose PHASE-02 options at intended tiers", () => {
  const product = JSON.parse(read("config/ai/product-plan.json"));
  const options = JSON.parse(read("config/ai/options-bank.json"));
  const byId = Object.fromEntries(product.plans.map((plan) => [plan.id, plan]));

  for (const id of phase2Ids) {
    assert.ok(product.runtime_implemented_option_ids.includes(id));
    assert.equal(
      options.options.find((option) => option.id === id)?.runtime_status,
      "implemented",
    );
  }

  assert.ok(byId.starter.option_ids.includes("OPT-TAG-EXCLUSIONS"));
  assert.ok(!byId.starter.option_ids.includes("OPT-PINNED-PRODUCTS"));
  assert.ok(!byId.starter.option_ids.includes("OPT-ADVANCED-SORT-RULES"));
  assert.ok(!byId.starter.option_ids.includes("OPT-MULTI-LOCATION"));

  for (const id of [
    "OPT-TAG-EXCLUSIONS",
    "OPT-PINNED-PRODUCTS",
    "OPT-ADVANCED-SORT-RULES",
  ]) {
    assert.ok(byId.growth.option_ids.includes(id));
  }
  assert.ok(!byId.growth.option_ids.includes("OPT-MULTI-LOCATION"));

  for (const planId of ["pro", "unlimited"]) {
    for (const id of phase2Ids) {
      assert.ok(byId[planId].option_ids.includes(id));
    }
  }
});

test("rule normalization and server-side entitlement gates are explicit", () => {
  const rules = read("app/services/collection-sort-rules.ts");

  assert.match(rules, /MAX_RULE_ITEMS = 500/);
  assert.match(rules, /normalizeCollectionRuleInput/);
  assert.match(rules, /assertCollectionRuleEntitlements/);
  assert.match(rules, /effectiveCollectionRules/);
  assert.match(rules, /does not include exclusion rules/);
  assert.match(rules, /does not include pinned products/);
  assert.match(rules, /does not include advanced sorting/);
  assert.match(rules, /does not include multi-location inventory rules/);
  assert.match(rules, /ANY_SELECTED_LOCATION/);
  assert.match(rules, /ALL_SELECTED_LOCATIONS/);
});

test("sorting engine implements exclusion, pin, advanced and location precedence", () => {
  const sorter = read("app/services/collection-sorter.server.ts");

  assert.match(sorter, /listAllLocations/);
  assert.ok(sorter.includes('inventoryLevels(first: $levelsFirst)'));
  assert.ok(sorter.includes('quantities(names: ["available"])'));
  assert.match(sorter, /appendRemainingInventoryLevels/);
  assert.match(sorter, /LOCATION_INVENTORY_CONCURRENCY = 5/);
  assert.match(sorter, /Excluded products stay fixed at their exact original indices/);
  assert.match(sorter, /pinnedRank/);
  assert.match(sorter, /compareAvailableProducts/);
  assert.match(sorter, /TITLE_ASC/);
  assert.match(sorter, /INVENTORY_DESC/);
  assert.match(sorter, /NEWEST/);
  assert.match(sorter, /ALL_SELECTED_LOCATIONS/);
  assert.match(sorter, /buildSequentialMoves/);
  assert.match(sorter, /MAX_REORDER_MOVES = 250/);
  assert.ok(sorter.includes("moves.slice(index, index + MAX_REORDER_MOVES)"));
  assert.match(sorter, /sortEnabledCollections/);
  assert.match(sorter, /currentEntitledOptionIds/);
});

test("merchant UI persists PHASE-02 rules and hosted re-sorts use Queue", () => {
  const index = read("app/routes/app._index.tsx");
  const queue = read("app/sort-queue.server.ts");
  const consumer = read("app/routes/internal.queue-sort.tsx");

  assert.match(index, /intent === "saveRules"/);
  assert.match(index, /saveCollectionRules/);
  assert.match(index, /reason: "rules-update"/);
  assert.match(index, /excludedTags/);
  assert.match(index, /excludedVendors/);
  assert.match(index, /excludedProducts/);
  assert.match(index, /pinnedProducts/);
  assert.match(index, /availableSortMode/);
  assert.match(index, /inventoryMode/);
  assert.match(index, /inventoryLocationIds/);
  assert.match(index, /canUseExclusions/);
  assert.match(index, /canUsePinnedProducts/);
  assert.match(index, /canUseAdvancedSort/);
  assert.match(index, /canUseMultiLocation/);
  assert.match(queue, /"rules-update"/);
  assert.ok(consumer.includes('job.reason === "rules-update"'));
});

test("PHASE-02 is repository-tracked under Issue 97 while implementation is active", () => {
  const plan = JSON.parse(read("config/ai/execution-plan.json"));
  const state = JSON.parse(read("config/ai/project-state.json"));
  const modules = JSON.parse(read("config/ai/modules-bank.json"));

  const phase = plan.phases.find((item) => item.id === "PHASE-02");
  const module = modules.modules.find(
    (item) => item.id === "MOD-SORTING-CONTROLS",
  );

  assert.equal(plan.active_issue, 97);
  assert.equal(state.active_issue, 97);
  assert.equal(state.current_phase, "PHASE-02");
  assert.ok(phase);
  assert.ok(module);
  assert.equal(phase.status, "in_progress");
  assert.equal(module.status, "in_progress");

  for (const id of [
    "ISSUE-97-WU-01",
    "ISSUE-97-WU-02",
    "ISSUE-97-WU-03",
    "ISSUE-97-WU-04",
  ]) {
    assert.ok(plan.work_units.some((item) => item.id === id));
  }
});
