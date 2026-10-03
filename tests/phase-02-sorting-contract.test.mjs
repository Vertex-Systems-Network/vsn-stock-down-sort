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
    assert.ok(local.includes(field), field + " missing from Local schema");
    assert.ok(cloud.includes(field), field + " missing from cloud schema");
    assert.ok(
      localMigration.includes('"' + field + '"'),
      field + " missing from Local migration",
    );
    assert.ok(
      cloudMigration.includes('"' + field + '"'),
      field + " missing from cloud migration",
    );
  }

  assert.equal(/\bDROP\b/i.test(localMigration), false);
  assert.equal(/\bDROP\b/i.test(cloudMigration), false);
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

  for (const required of [
    "MAX_RULE_ITEMS = 500",
    "normalizeCollectionRuleInput",
    "assertCollectionRuleEntitlements",
    "effectiveCollectionRules",
    "does not include exclusion rules",
    "does not include pinned products",
    "does not include advanced sorting",
    "does not include multi-location inventory rules",
    "ANY_SELECTED_LOCATION",
    "ALL_SELECTED_LOCATIONS",
  ]) {
    assert.ok(rules.includes(required), required);
  }
});

test("sorting engine implements exclusion, pin, advanced and location precedence", () => {
  const sorter = read("app/services/collection-sorter.server.ts");

  for (const required of [
    "listAllLocations",
    "inventoryLevels(first: $levelsFirst)",
    'quantities(names: ["available"])',
    "appendRemainingInventoryLevels",
    "LOCATION_INVENTORY_CONCURRENCY = 5",
    "Excluded products stay fixed at their exact original indices",
    "pinnedRank",
    "compareAvailableProducts",
    "TITLE_ASC",
    "INVENTORY_DESC",
    "NEWEST",
    "ALL_SELECTED_LOCATIONS",
    "buildSequentialMoves",
    "MAX_REORDER_MOVES = 250",
    "moves.slice(index, index + MAX_REORDER_MOVES)",
    "sortEnabledCollections",
    "currentEntitledOptionIds",
  ]) {
    assert.ok(sorter.includes(required), required);
  }
});

test("merchant UI persists PHASE-02 rules and hosted re-sorts use Queue", () => {
  const index = read("app/routes/app._index.tsx");
  const queue = read("app/sort-queue.server.ts");
  const consumer = read("app/routes/internal.queue-sort.tsx");

  for (const required of [
    'intent === "saveRules"',
    "saveCollectionRules",
    'reason: "rules-update"',
    "excludedTags",
    "excludedVendors",
    "excludedProducts",
    "pinnedProducts",
    "availableSortMode",
    "inventoryMode",
    "inventoryLocationIds",
    "canUseExclusions",
    "canUsePinnedProducts",
    "canUseAdvancedSort",
    "canUseMultiLocation",
  ]) {
    assert.ok(index.includes(required), required);
  }

  assert.ok(queue.includes('"rules-update"'));
  assert.ok(consumer.includes('job.reason === "rules-update"'));
});

test("PHASE-02 completion remains repository-tracked after later phases advance", () => {
  const plan = JSON.parse(read("config/ai/execution-plan.json"));
  const state = JSON.parse(read("config/ai/project-state.json"));
  const modules = JSON.parse(read("config/ai/modules-bank.json"));

  const phase = plan.phases.find((item) => item.id === "PHASE-02");
  const module = modules.modules.find(
    (item) => item.id === "MOD-SORTING-CONTROLS",
  );

  assert.ok(phase);
  assert.ok(module);
  assert.equal(phase.status, "complete");
  assert.equal(module.status, "complete");

  const expectedCurrentPhaseStatus =
    state.active_issue === null ? "complete" : "in_progress";
  assert.ok(
    plan.phases.some(
      (item) =>
        item.id === state.current_phase &&
        item.status === expectedCurrentPhaseStatus,
    ),
  );
  assert.ok(
    state.active_issue === null ||
      (Number.isInteger(state.active_issue) && state.active_issue >= 97),
  );

  for (const id of [
    "ISSUE-97-WU-01",
    "ISSUE-97-WU-02",
    "ISSUE-97-WU-03",
    "ISSUE-97-WU-04",
  ]) {
    const workUnit = plan.work_units.find((item) => item.id === id);
    assert.ok(workUnit);
    assert.equal(workUnit.status, "complete");
    assert.match(workUnit.phase_id, /^PHASE-02$/);
  }
});
