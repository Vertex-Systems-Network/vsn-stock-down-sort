import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("PHASE-07 persistence is mirrored across Local and hosted schemas", () => {
  const local = read("prisma/schema.prisma");
  const cloud = read("prisma/cloud/schema.prisma");

  for (const source of [local, cloud]) {
    assert.match(source, /model CommerceVisibilitySetting\b/);
    assert.match(source, /enabled\s+Boolean/);
    assert.match(source, /autoRepublish\s+Boolean/);
    assert.match(source, /targets\s+String/);

    assert.match(source, /model ProductPublicationState\b/);
    assert.match(source, /publicationId\s+String/);
    assert.match(source, /contextType\s+String/);
    assert.match(source, /previousPublished\s+Boolean/);
    assert.match(source, /merchantOverride\s+Boolean/);
    assert.match(source, /managedUnpublishedAt\s+DateTime\?/);
    assert.match(source, /restoredAt\s+DateTime\?/);
    assert.match(
      source,
      /@@unique\(\[shop, productId, publicationId\]\)/,
    );
    assert.match(source, /@@index\(\[shop, productId\]\)/);
    assert.match(source, /@@index\(\[shop, contextType\]\)/);
  }
});

test("enterprise permissions remain optional and base scopes stay unchanged", () => {
  for (const path of [
    "shopify.app.local.toml",
    "shopify.app.toml",
    "shopify.app.staging.toml",
    "shopify.app.production.toml",
  ]) {
    const source = read(path);
    assert.ok(
      source.includes(
        'scopes = "read_products,write_products,read_inventory"',
      ),
      path,
    );
    assert.ok(
      source.includes(
        'optional_scopes = [ "write_publications", "read_markets", "read_companies" ]',
      ),
      path,
    );
  }
});

test("PHASE-07 capabilities are runtime-implemented and Unlimited-only", () => {
  const plan = JSON.parse(read("config/ai/product-plan.json"));
  const options = JSON.parse(read("config/ai/options-bank.json"));
  const implemented = new Set(plan.runtime_implemented_option_ids);
  const optionIds = [
    "OPT-MARKETS",
    "OPT-B2B-CATALOGS",
    "OPT-SALES-CHANNEL-RULES",
  ];

  for (const optionId of optionIds) {
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

  for (const planId of ["starter", "growth", "pro"]) {
    for (const optionId of optionIds) {
      assert.equal(
        byId[planId].option_ids.includes(optionId),
        false,
        `${planId} / ${optionId}`,
      );
    }
  }

  for (const optionId of optionIds) {
    assert.equal(
      byId.unlimited.option_ids.includes(optionId),
      true,
      optionId,
    );
  }
});

test("enterprise target contract is bounded, typed and scope-aware", () => {
  const shared = read("app/services/commerce-visibility.ts");

  assert.ok(shared.includes("MAX_COMMERCE_PUBLICATION_TARGETS = 25"));
  assert.ok(shared.includes('"MARKET" | "B2B" | "CHANNEL"'));
  assert.ok(shared.includes('"write_publications"'));
  assert.ok(shared.includes('"read_markets"'));
  assert.ok(shared.includes('"read_companies"'));
  assert.ok(shared.includes("requiredOptionalScopes"));
  assert.ok(shared.includes("missingOptionalScopes"));
  assert.ok(shared.includes("assertCommerceEntitlements"));
  assert.ok(shared.includes("OPT-MARKETS"));
  assert.ok(shared.includes("OPT-B2B-CATALOGS"));
  assert.ok(shared.includes("OPT-SALES-CHANNEL-RULES"));
});

test("publication engine uses current Publishable APIs and catalog classifications", () => {
  const server = read("app/services/commerce-visibility.server.ts");

  assert.ok(server.includes('catalogType: "APP"'));
  assert.ok(server.includes('catalogType: "NONE"'));
  assert.ok(server.includes('catalogType: "MARKET"'));
  assert.ok(server.includes('catalogType: "COMPANY_LOCATION"'));
  assert.ok(server.includes("publishedOnPublication"));
  assert.ok(server.includes("publishablePublish"));
  assert.ok(server.includes("publishableUnpublish"));
  assert.equal(/\bproductPublish\s*\(/.test(server), false);
  assert.equal(/\bproductUnpublish\s*\(/.test(server), false);
});

test("publication restore is VSN-owned and merchant overrides are preserved", () => {
  const server = read("app/services/commerce-visibility.server.ts");

  assert.ok(server.includes("previousPublished"));
  assert.ok(server.includes("merchantOverride"));
  assert.ok(server.includes("managedUnpublishedAt"));
  assert.ok(server.includes("if (state?.merchantOverride) continue"));
  assert.ok(server.includes("merchantOverride: true"));
  assert.ok(server.includes("previousPublished: true"));
  assert.ok(server.includes("settingRecord?.autoRepublish"));
  assert.ok(server.includes('product.status === "ACTIVE"'));
  assert.ok(server.includes("reconcileCommerceVisibilitySafe"));
  assert.ok(server.includes('"enterprise-visibility-error"'));
});

test("enterprise visibility is sequentially isolated inside existing event processing", () => {
  const consumer = read("app/routes/internal.queue-sort.tsx");
  const inventory = read(
    "app/routes/webhooks.inventory-levels-update.tsx",
  );
  const product = read("app/routes/webhooks.products-update.tsx");

  for (const source of [consumer, inventory, product]) {
    const phase3Index = source.indexOf("reconcileProductVisibility(");
    const phase7Index = source.indexOf("reconcileCommerceVisibilitySafe(");
    assert.ok(phase3Index >= 0, "Phase-03 reconciliation missing");
    assert.ok(phase7Index > phase3Index, "Phase-07 must run after Phase-03");
  }

  assert.ok(consumer.includes("commerceResult"));
});

test("Commerce UI uses progressive server-side optional scope management", () => {
  const route = read("app/routes/app.commerce.tsx");
  const nav = read("app/routes/app.tsx");

  assert.ok(route.includes("authenticate.admin(request)"));
  assert.ok(route.includes("scopes.query()"));
  assert.ok(route.includes("scopes.request([...requested])"));
  assert.ok(route.includes("SCOPE_GROUPS"));
  assert.ok(route.includes("write_publications"));
  assert.ok(route.includes("read_markets"));
  assert.ok(route.includes("read_companies"));
  assert.ok(route.includes("listCommercePublicationTargets"));
  assert.ok(route.includes("saveCommerceVisibilitySetting"));
  assert.ok(route.includes("merchant manual"));
  assert.ok(route.includes("does not claim"));
  assert.ok(nav.includes("/app/commerce"));
});
