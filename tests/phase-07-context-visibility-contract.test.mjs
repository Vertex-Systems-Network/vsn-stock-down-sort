import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("PHASE-07 context visibility persistence is mirrored across Local and hosted schemas", () => {
  const local = read("prisma/schema.prisma");
  const cloud = read("prisma/cloud/schema.prisma");

  for (const source of [local, cloud]) {
    assert.match(source, /model ContextVisibilityRule\b/);
    assert.match(source, /targetType\s+String/);
    assert.match(source, /publicationId\s+String/);
    assert.match(source, /targetTitle\s+String/);
    assert.match(source, /autoRestore\s+Boolean/);
    assert.match(source, /@@unique\(\[shop, publicationId\]\)/);

    assert.match(source, /model ContextPublicationState\b/);
    assert.match(source, /ruleId\s+String/);
    assert.match(source, /productId\s+String/);
    assert.match(source, /managedHidden\s+Boolean/);
    assert.match(source, /@@unique\(\[shop, ruleId, productId\]\)/);
    assert.match(
      source,
      /@@index\(\[shop, publicationId, managedHidden\]\)/,
    );
  }
});

test("PHASE-07 publication scopes are explicit in all Shopify app configs", () => {
  for (const path of [
    "shopify.app.toml",
    "shopify.app.staging.toml",
    "shopify.app.production.toml",
  ]) {
    const source = read(path);
    assert.ok(source.includes("read_publications"), path);
    assert.ok(source.includes("write_publications"), path);
  }
});

test("PHASE-07 capabilities are Unlimited-only and repository-implemented", () => {
  const plan = JSON.parse(read("config/ai/product-plan.json"));
  const options = JSON.parse(read("config/ai/options-bank.json"));
  const ids = [
    "OPT-MARKETS",
    "OPT-B2B-CATALOGS",
    "OPT-SALES-CHANNEL-RULES",
  ];

  for (const id of ids) {
    assert.equal(plan.runtime_implemented_option_ids.includes(id), true, id);
    assert.equal(
      options.options.find((option) => option.id === id)?.runtime_status,
      "implemented",
      id,
    );

    for (const planId of ["starter", "growth", "pro"]) {
      const item = plan.plans.find((entry) => entry.id === planId);
      assert.equal(item.option_ids.includes(id), false, `${planId}:${id}`);
    }

    const unlimited = plan.plans.find((entry) => entry.id === "unlimited");
    assert.equal(unlimited.option_ids.includes(id), true, id);
  }
});

test("context discovery uses existing Shopify publications and never creates catalogs", () => {
  const shared = read("app/services/context-visibility.ts");
  const server = read("app/services/context-visibility.server.ts");

  for (const id of [
    "OPT-MARKETS",
    "OPT-B2B-CATALOGS",
    "OPT-SALES-CHANNEL-RULES",
  ]) {
    assert.ok(shared.includes(id), id);
  }

  assert.ok(server.includes('if (targetType === "MARKET") return "MARKET"'));
  assert.ok(
    server.includes(
      'if (targetType === "COMPANY_LOCATION") return "COMPANY_LOCATION"',
    ),
  );
  assert.ok(server.includes('return "NONE"'));
  assert.ok(server.includes("publications(first: 100, catalogType: $catalogType)"));
  assert.ok(server.includes("channels(first: 10)"));
  assert.equal(server.includes("catalogCreate("), false);
  assert.equal(server.includes("publicationCreate("), false);
});

test("publication visibility engine checks membership and restores only VSN-owned removals", () => {
  const server = read("app/services/context-visibility.server.ts");

  assert.ok(server.includes("publishedOnPublication(publicationId: $publicationId)"));
  assert.ok(server.includes("publicationUpdate(id: $id, input: $input)"));
  assert.ok(server.includes("publishablesToAdd"));
  assert.ok(server.includes("publishablesToRemove"));
  assert.ok(server.includes("PUBLICATION_MUTATION_LIMIT = 50"));
  assert.ok(server.includes("productIds.length > PUBLICATION_MUTATION_LIMIT"));

  assert.ok(server.includes("merchant-owned-unpublished"));
  assert.ok(server.includes("merchant-publication-override"));
  assert.ok(server.includes("managedHidden: true"));
  assert.ok(server.includes("if (!state?.managedHidden)"));
  assert.ok(server.includes("auto-restore-disabled"));
  assert.ok(server.includes("context_visibility.product_removed"));
  assert.ok(server.includes("context_visibility.product_restored"));

  assert.ok(
    server.includes(
      "Restore or clear VSN-managed publication removals before deleting this rule.",
    ),
  );
  assert.ok(
    server.includes(
      "Keep it enabled until those products are restored.",
    ),
  );
});

test("PHASE-07 uses hosted Queue jobs and deterministic Local fallback", () => {
  const queue = read("app/sort-queue.server.ts");
  const consumer = read("app/routes/internal.queue-sort.tsx");
  const inventoryWebhook = read(
    "app/routes/webhooks.inventory-levels-update.tsx",
  );
  const productWebhook = read(
    "app/routes/webhooks.products-update.tsx",
  );

  assert.ok(queue.includes('kind: "alert" | "context_visibility"'));
  assert.ok(consumer.includes('job.kind === "context_visibility"'));
  assert.ok(consumer.includes('payload.kind === "context_visibility"'));
  assert.ok(consumer.includes("reconcileContextVisibilityForProduct("));

  for (const webhook of [inventoryWebhook, productWebhook]) {
    assert.ok(webhook.includes('kind: "context_visibility" as const'));
    assert.ok(webhook.includes("reconcileContextVisibilityForProduct("));
    assert.ok(webhook.includes("enqueueSortJobs(context, jobs)"));
  }
});

test("Commerce Contexts UI is authenticated, plan-aware and exposes scope/runtime boundaries", () => {
  const route = read("app/routes/app.contexts.tsx");
  const nav = read("app/routes/app.tsx");

  assert.ok(route.includes("authenticate.admin(request)"));
  assert.ok(route.includes("getCurrentSubscriptionPlan"));
  assert.ok(route.includes("listPublicationTargets"));
  assert.ok(route.includes("listContextVisibilityRules(session.shop)"));
  assert.ok(route.includes("saveContextVisibilityRule"));
  assert.ok(route.includes("setContextVisibilityRuleEnabled"));
  assert.ok(route.includes("deleteContextVisibilityRule"));
  assert.ok(route.includes("read_publications"));
  assert.ok(route.includes("write_publications"));
  assert.ok(route.includes("require scope"));
  assert.ok(route.includes("does not create Markets"));
  assert.ok(nav.includes("/app/contexts"));
});
