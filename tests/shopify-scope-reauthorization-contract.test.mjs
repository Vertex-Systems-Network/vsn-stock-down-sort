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
  assert.match(action, /authenticate\.admin\(request\)/);
  assert.match(action, /scopes\.request\(\[\.\.\.PUBLICATION_SCOPES\]\)/);
  assert.match(action, /Never accept scope names or redirect targets/);
  assert.match(scopes, /read_publications/);
  assert.match(scopes, /write_publications/);
  assert.doesNotMatch(action, /formData\(\)/);
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
