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
  const source = read("app/services/product-visibility.server.ts");

  assert.match(source, /OPT-AUTO-HIDE-PRODUCTS/);
  assert.match(source, /OPT-AUTO-REPUBLISH/);
  assert.match(source, /OPT-SEO-SAFE-HIDE/);
  assert.match(source, /"DRAFT"/);
  assert.match(source, /"UNLISTED"/);
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

test("variant visibility is not falsely advertised as implemented", () => {
  const plan = JSON.parse(read("config/ai/product-plan.json"));
  assert.equal(
    plan.runtime_implemented_option_ids.includes("OPT-HIDE-SOLD-OUT-VARIANTS"),
    false,
  );
  assert.equal(
    plan.runtime_implemented_option_ids.includes("OPT-VARIANT-RESTORE"),
    false,
  );

  const route = read("app/routes/app.visibility.tsx");
  assert.match(route, /WU-03 pending certification/);
});
