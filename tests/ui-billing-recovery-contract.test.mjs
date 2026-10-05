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
  assert.ok(styles.includes("#3e4144"));
  assert.ok(styles.includes("#625ba8"));
  assert.ok(styles.includes("#5cc9d7"));
  assert.ok(styles.includes("#6488c6"));
  assert.ok(home.includes("Available first. Sold out last. Automatically."));
  assert.ok(home.includes("vsn-task-grid"));
});

test("billing client uses App Bridge token auth and keeps an approval fallback link", () => {
  const client = read("app/billing-client.ts");
  const plans = read("app/routes/app.plans.tsx");

  assert.ok(client.includes("await shopify.idToken()"));
  assert.ok(client.includes('Authorization: `Bearer ${token}`'));
  assert.ok(client.includes('redirect: "error"'));
  assert.ok(client.includes('url.hostname.endsWith(".myshopify.com")'));
  assert.ok(client.includes('url.pathname.startsWith("/admin/charges/")'));
  assert.ok(client.includes("https://admin.shopify.com/store/"));
  assert.ok(client.includes('window.open(confirmationUrl, "_top")'));
  assert.ok(plans.includes("openBillingConfirmation(response.confirmationUrl)"));
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
    "/app/documentation",
    "/app/support",
  ]) {
    assert.ok(workspace.includes(route), route);
  }
});


test("workspace UX improvements stay inside the app and expose beginner documentation", () => {
  const home = read("app/routes/app._index.tsx");
  const workspace = read("app/components/Workspace.tsx");
  const styles = read("app/styles/workspace.css");
  const docs = read("app/routes/app.documentation.tsx");
  const plans = read("app/routes/app.plans.tsx");

  assert.ok(styles.includes("padding: 22px 8px 40px"));
  assert.ok(styles.includes("inline-size: calc(100% - min(6vw, 96px) + 32px)"));
  assert.equal(home.includes("vsn-collection-toggle"), false);
  assert.ok(home.includes('className="vsn-collections-table"'));
  assert.ok(home.includes('className="vsn-row-actions"'));
  assert.ok(home.includes('className="vsn-row-action primary"'));
  assert.ok(home.includes('className="vsn-row-action toggle"'));
  assert.ok(home.includes('onClick={() => runAction("enable", collection.id)}'));
  assert.ok(home.includes('runAction("disable", collection.id, false)'));
  assert.equal(home.includes("<s-button-group>"), false);
  assert.ok(home.includes("Enable all collections"));
  assert.ok(home.includes("Disable all collections"));
  assert.equal(home.includes('slot="primary-action"'), false);
  assert.equal(home.includes('slot="secondary-actions"'), false);

  assert.ok(workspace.includes("vsn-nav-tooltip"));
  assert.ok(styles.includes(".vsn-workspace.is-collapsed .vsn-nav-tooltip"));
  assert.ok(workspace.includes("/app/documentation"));

  assert.ok(styles.includes("--vsn-accent: #625ba8"));
  assert.ok(styles.includes("--vsn-accent-teal: #5cc9d7"));
  assert.ok(styles.includes("--vsn-accent-blue: #6488c6"));
  assert.ok(styles.includes("--vsn-ink: #3e4144"));

  assert.ok(docs.includes("Learn VSN Stock Down Sort from zero."));
  assert.ok(docs.includes("What it does:"));
  assert.ok(docs.includes("When to use it:"));
  assert.ok(docs.includes("Where to find it:"));
  assert.ok(docs.includes("UiSnapshot"));
  assert.ok(docs.includes("GUIDES"));

  assert.ok(plans.includes("ALL_IMPLEMENTED_FEATURES"));
  assert.ok(plans.includes("Everything in "));
  assert.ok(plans.includes("vsn-feature-check"));
  assert.equal(plans.includes("features.slice(1, 7)"), false);
});


test("collections page does not render escaped newline text", () => {
  const home = read("app/routes/app._index.tsx");

  assert.equal(home.includes('/>\\n      <s-section padding="none">'), false);
});


test("collection table renders visible branded row actions instead of shadow button groups", () => {
  const home = read("app/routes/app._index.tsx");
  const styles = read("app/styles/workspace.css");

  assert.ok(home.includes("<table className=\"vsn-collections-table\">"));
  assert.ok(home.includes(">Enable</button>") || home.includes('"Enable"'));
  assert.ok(home.includes(">Disable</button>") || home.includes('"Disable"'));
  assert.ok(home.includes("Sort now"));
  assert.ok(home.includes("Rules"));
  assert.ok(home.includes("vsn-status-badge"));
  assert.ok(styles.includes("min-width: 330px"));
  assert.ok(styles.includes("background: var(--vsn-accent)"));
});


test("all app screens use the shared Vertex page and control system", () => {
  const styles = read("app/styles/workspace.css");
  const brandUi = read("app/components/BrandUi.tsx");
  const routes = [
    "app/routes/app._index.tsx",
    "app/routes/app.alerts.tsx",
    "app/routes/app.analytics.tsx",
    "app/routes/app.automation.tsx",
    "app/routes/app.contexts.tsx",
    "app/routes/app.integrations.tsx",
    "app/routes/app.plans.tsx",
    "app/routes/app.support.tsx",
    "app/routes/app.visibility.tsx",
    "app/routes/app.documentation.tsx",
  ];

  assert.ok(brandUi.includes("export function PageShell"));
  assert.ok(brandUi.includes("export function BrandBadge"));
  assert.ok(brandUi.includes("export function BrandNotice"));
  assert.ok(brandUi.includes("export function BrandButton"));
  assert.ok(styles.includes("Global Vertex UI system: shared by every app screen"));
  assert.ok(styles.includes(".vsn-route-heading"));
  assert.ok(styles.includes(".vsn-brand-badge"));
  assert.ok(styles.includes(".vsn-brand-notice"));
  assert.ok(styles.includes(".vsn-page-wide"));

  for (const routePath of routes) {
    const route = read(routePath);
    assert.equal(route.includes("<s-page"), false, routePath + " must not use capped s-page");
    assert.equal(route.includes("<s-button"), false, routePath + " must not use default s-button");
    assert.equal(route.includes("<s-badge"), false, routePath + " must not use default s-badge");
    assert.equal(route.includes("<s-banner"), false, routePath + " must not use default s-banner");
    assert.ok(
      route.includes("<PageShell") || route.includes('className="vsn-page-wide"'),
      routePath + " must use the shared wide page shell",
    );
  }
});
