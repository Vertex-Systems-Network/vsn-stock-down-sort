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
  assert.ok(route.includes("A previous subscription no longer matches the current catalog."));
  assert.ok(route.includes("Cancel incompatible subscription"));
  assert.ok(route.includes("choose a current VSN plan"));
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


test("embedded app uses the same branded workspace pattern as VSN Metafields", () => {
  const app = read("app/routes/app.tsx");
  const workspace = read("app/components/Workspace.tsx");
  const styles = read("app/styles/workspace.css");
  const home = read("app/routes/app._index.tsx");

  assert.ok(app.includes("<Workspace"));
  assert.ok(app.includes('appName="VSN | Stock Down Sort"'));
  assert.ok(workspace.includes("vsn-sidebar"));
  assert.ok(workspace.includes("Collapse menu"));
  assert.ok(workspace.includes("Need a hand?"));
  assert.ok(styles.includes(".vsn-hero"));
  assert.ok(styles.includes(".vsn-plan-grid"));
  assert.ok(styles.includes("#173e30"));
  assert.ok(home.includes("Available first. Sold out last. Automatically."));
  assert.ok(home.includes("vsn-task-grid"));
});

test("billing client uses App Bridge token auth and keeps an approval fallback link", () => {
  const client = read("app/billing-client.ts");
  const plans = read("app/routes/app.plans.tsx");

  assert.ok(client.includes("await shopify.idToken()"));
  assert.ok(client.includes('Authorization: `Bearer ${token}`'));
  assert.ok(client.includes('redirect: "error"'));
  assert.ok(plans.includes('window.open(response.confirmationUrl, "_top")'));
  assert.ok(plans.includes("Continue to Shopify plan approval"));
});


test("workspace owns the complete Stock Down Sort internal navigation", () => {
  const workspace = read("app/components/Workspace.tsx");

  for (const route of [
    "/app",
    "/app/visibility",
    "/app/contexts",
    "/app/analytics",
    "/app/automation",
    "/app/alerts",
    "/app/integrations",
    "/app/plans",
    "/app/support",
  ]) {
    assert.ok(workspace.includes(route), route);
  }
});
