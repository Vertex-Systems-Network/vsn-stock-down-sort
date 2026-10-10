import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");
const requiredScopes = "read_products,write_products,read_inventory,read_locations";
const publicationScopes = ["read_publications", "write_publications"];

for (const [environment, path] of [
  ["Dev local", "shopify.app.local.toml"],
  ["Dev default", "shopify.app.toml"],
  ["Staging", "shopify.app.staging.toml"],
  ["Live", "shopify.app.production.toml"],
]) {
  test(environment + " declares publication permissions as optional scopes", () => {
    const config = read(path);
    assert.ok(config.includes('scopes = "' + requiredScopes + '"'));
    assert.match(config, /optional_scopes = \["read_publications", "write_publications"\]/);
    for (const scope of publicationScopes) assert.ok(config.includes(scope));
  });
}

test("app surfaces missing publication permissions and offers authorization", () => {
  const layout = read("app/routes/app.tsx");
  const action = read("app/routes/app.permissions.tsx");
  const scopes = read("app/services/shopify-scopes.ts");
  assert.match(layout, /scopes\.query\(\)/);
  assert.match(layout, /missingPublicationScopes/);
  assert.match(layout, /Authorize Shopify access/);
  assert.match(layout, /reauthorizationAction/);
  assert.match(layout, /method="post"[^>]*reloadDocument/);
  assert.match(layout, /vsn-publication-permission-notice/);
  assert.match(action, /authenticate\.admin\(request\)/);
  assert.match(action, /scopes\.request\(\[\.\.\.PUBLICATION_SCOPES\]\)/);
  assert.match(action, /Never accept scope names or redirect targets/);
  assert.match(scopes, /read_publications/);
  assert.match(scopes, /write_publications/);
  assert.doesNotMatch(action, /formData\(\)/);
});

test("publication permission notice aligns with page content and leaves bottom spacing", () => {
  const styles = read("app/styles/workspace.css");
  assert.match(
    styles,
    /\.vsn-publication-permission-notice\s*\{[^}]*inline-size:\s*calc\(100% - min\(6vw, 96px\)\)[^}]*margin:\s*0 auto 24px/s,
  );
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*?\.vsn-publication-permission-notice\s*\{\s*inline-size:\s*calc\(100% - 20px\)/);
});

test("runtime required scopes exclude dynamically requested publication scopes", () => {
  const paths = [
    ".github/workflows/app-validation.yml",
    ".github/workflows/cloudflare-staging-deploy.yml",
    ".github/workflows/cloudflare-production-prepare.yml",
    ".github/workflows/staging-readiness.yml",
    ".github/workflows/production-readiness.yml",
  ];
  for (const path of paths) {
    const workflow = read(path);
    assert.ok(workflow.includes("SCOPES: " + requiredScopes), path);
    assert.doesNotMatch(workflow, /SCOPES: [^\n]*read_publications/);
  }
});

test("binary settings use Shopify switches and reinstall billing is explained", () => {
  const visibility = read("app/routes/app.visibility.tsx");
  const contexts = read("app/routes/app.contexts.tsx");
  const alerts = read("app/routes/app.alerts.tsx");
  const automation = read("app/routes/app.automation.tsx");
  const plans = read("app/routes/app.plans.tsx");

  for (const [source, name] of [
    [visibility, "autoRepublish"],
    [contexts, "enabled"],
    [contexts, "autoRestore"],
    [alerts, "emailEnabled"],
    [alerts, "slackEnabled"],
    [automation, "enabled"],
  ]) {
    assert.match(source, new RegExp('<s-switch[\\s\\S]*?name="' + name + '"[\\s\\S]*?value="on"'));
  }

  assert.ok(alerts.includes("<s-checkbox") && alerts.includes('name="clearSlackWebhook"'));
  const home = read("app/routes/app._index.tsx");
  assert.ok(home.includes("<s-checkbox") && home.includes('name="inventoryLocationIds"'));
  const integrations = read("app/routes/app.integrations.tsx");
  assert.ok(integrations.includes("<s-checkbox") && integrations.includes('name="scopes"'));
  assert.match(plans, /Shopify automatically cancels an app subscription when the app is/);
});
