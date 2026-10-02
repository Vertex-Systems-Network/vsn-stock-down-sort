import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("PHASE-03 persistence is mirrored across Local and hosted schemas", () => {
  const local = read("prisma/schema.prisma");
  const cloud = read("prisma/cloud/schema.prisma");

  for (const model of ["VisibilitySetting", "ProductVisibilityState"]) {
    assert.match(local, new RegExp(`model ${model}\\b`));
    assert.match(cloud, new RegExp(`model ${model}\\b`));
  }

  assert.match(local, /@@unique\(\[shop, productId\]\)/);
  assert.match(cloud, /@@unique\(\[shop, productId\]\)/);
});

test("product visibility engine preserves merchant state and supports SEO-safe hide", () => {
  const shared = read("app/services/product-visibility.ts");
  const source = read("app/services/product-visibility.server.ts");

  assert.match(shared, /OPT-AUTO-HIDE-PRODUCTS/);
  assert.match(shared, /OPT-AUTO-REPUBLISH/);
  assert.match(shared, /OPT-SEO-SAFE-HIDE/);
  assert.match(shared, /"DRAFT"/);
  assert.match(shared, /"UNLISTED"/);
  assert.match(source, /previousStatus/);
  assert.match(source, /merchant-status-override/);
  assert.match(source, /product\.status !== "ACTIVE"/);
  assert.match(source, /state\.previousStatus === "ACTIVE"/);
});

test("product and inventory webhooks use the same visibility engine through Queue or Local fallback", () => {
  const productWebhook = read("app/routes/webhooks.products-update.tsx");
  const inventoryWebhook = read("app/routes/webhooks.inventory-levels-update.tsx");
  const queueConsumer = read("app/routes/internal.queue-sort.tsx");

  assert.match(productWebhook, /kind: "visibility"/);
  assert.match(productWebhook, /reconcileProductVisibility/);
  assert.match(inventoryWebhook, /productIdForInventoryItem/);
  assert.match(inventoryWebhook, /kind: "visibility"/);
  assert.match(queueConsumer, /payload\.kind === "visibility"/);
  assert.match(queueConsumer, /reconcileProductVisibility/);
});

test("variant visibility has a real entitlement-gated storefront mechanism", () => {
  const shared = read("app/services/product-visibility.ts");
  const server = read("app/services/product-visibility.server.ts");
  const block = read(
    "extensions/vsn-variant-visibility/blocks/variant-visibility.liquid",
  );
  const runtime = read(
    "extensions/vsn-variant-visibility/assets/variant-visibility.js",
  );
  const route = read("app/routes/app.visibility.tsx");

  assert.match(shared, /OPT-HIDE-SOLD-OUT-VARIANTS/);
  assert.match(shared, /OPT-VARIANT-RESTORE/);
  assert.match(server, /variant_visibility_entitled/);
  assert.match(server, /metafieldsSet/);
  assert.match(block, /app\.metafields\.vsn\.variant_visibility_entitled/);
  assert.match(block, /variant\.available/);
  assert.match(block, /javascript": "variant-visibility\.js"/);
  assert.match(runtime, /data-variant-id/);
  assert.match(runtime, /aria-disabled/);
  assert.match(runtime, /restoreManaged/);
  assert.match(route, /activateAppId=/);
  assert.match(route, /vsn-variant-visibility/);
});

test("PHASE-03 runtime catalog claims only repository-implemented capabilities", () => {
  const plan = JSON.parse(read("config/ai/product-plan.json"));
  const implemented = new Set(plan.runtime_implemented_option_ids);

  for (const optionId of [
    "OPT-AUTO-HIDE-PRODUCTS",
    "OPT-AUTO-REPUBLISH",
    "OPT-SEO-SAFE-HIDE",
    "OPT-HIDE-SOLD-OUT-VARIANTS",
    "OPT-VARIANT-RESTORE",
  ]) {
    assert.equal(implemented.has(optionId), true, optionId);
  }
});
