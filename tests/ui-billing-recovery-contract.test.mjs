import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("public root uses branded Shopify-native UI and no starter placeholders", () => {
  const route = read("app/routes/_index/route.tsx");

  assert.ok(route.includes('heading="VSN Stock Down Sort"'));
  assert.ok(route.includes("<AppProvider embedded={false}>"));
  assert.ok(route.includes("<s-text-field"));
  assert.ok(route.includes("Automatic stock sorting"));
  assert.equal(route.includes("A short heading about [your app]"), false);
  assert.equal(route.includes("A tagline about [your app]"), false);
  assert.equal(route.includes("Product feature"), false);
});

test("billing service reports why an active subscription no longer matches", () => {
  const service = read("app/services/billing.server.ts");

  assert.ok(service.includes("getSubscriptionMismatchDiagnostic"));
  assert.ok(service.includes("SubscriptionMismatchDiagnostic"));
  assert.ok(service.includes("does not match the current VSN plan catalog"));
  assert.ok(service.includes("now requires"));
  assert.ok(service.includes("this environment expects"));
});

test("packages UI exposes an explicit stale-subscription recovery action", () => {
  const route = read("app/routes/app.plans.tsx");

  assert.ok(route.includes("getSubscriptionMismatchDiagnostic"));
  assert.ok(route.includes("Incompatible active subscription"));
  assert.ok(route.includes("Cancel incompatible subscription"));
  assert.ok(route.includes("After cancellation, choose any current package below."));
});

test("explicit cancellation accepts the exact active Shopify subscription even when catalog resolution fails", () => {
  const route = read("app/routes/app.api.subscription.tsx");

  assert.equal(
    route.includes("Cancellation is blocked until it is reviewed."),
    false,
  );
  assert.ok(route.includes('activeSubscription.id !== subscriptionId'));
  assert.ok(route.includes('activeSubscription.status !== "ACTIVE"'));
  assert.ok(route.includes("cancelSubscription(admin, subscriptionId)"));
});
