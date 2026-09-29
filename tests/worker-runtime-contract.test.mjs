import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("Prisma runtime is Worker-compatible and request-scoped", () => {
  const schema = read("prisma/cloud/schema.prisma");
  const db = read("app/db.server.ts");
  const storage = read("app/prisma-session-storage.server.ts");
  const pkg = JSON.parse(read("package.json"));

  assert.match(schema, /engineType\s*=\s*"client"/);
  assert.match(schema, /provider\s*=\s*"postgresql"/);
  assert.match(db, /@prisma\/adapter-pg/);
  assert.match(db, /new PrismaPg\(\{ connectionString \}\)/);
  assert.match(db, /export async function withPrismaClient/);
  assert.doesNotMatch(db, /prismaGlobal|global\./);
  assert.doesNotMatch(db, /export default/);
  assert.match(storage, /RequestScopedPrismaSessionStorage/);
  assert.match(storage, /await prisma\.\$disconnect\(\)/);

  assert.equal(pkg.dependencies["@prisma/client"], "6.19.3");
  assert.equal(pkg.dependencies["@prisma/adapter-pg"], "6.19.3");
  assert.equal(pkg.dependencies.pg, "8.23.0");
  assert.equal(pkg.devDependencies.prisma, "6.19.3");
  assert.equal(pkg.devDependencies["@types/pg"], "8.23.1");
});

test("SSR and Worker entry stay Web-runtime compatible", () => {
  const entry = read("app/entry.server.tsx");
  const worker = read("workers/app.js");

  assert.match(entry, /renderToReadableStream/);
  assert.match(entry, /react-dom\/server\.browser/);
  assert.doesNotMatch(entry, /PassThrough|renderToPipeableStream|@react-router\/node/);

  assert.match(worker, /createRequestHandler/);
  assert.match(worker, /\.\.\/build\/server\/index\.js/);
  assert.match(worker, /async fetch\(request, env, ctx\)/);
  assert.match(worker, /cloudflare:\s*\{\s*env,\s*ctx\s*\}/);
});

test("Wrangler environments are isolated and declare required secrets", () => {
  const staging = JSON.parse(read("wrangler.staging.jsonc"));
  const production = JSON.parse(read("wrangler.production.jsonc"));

  assert.equal(staging.name, "vsn-stock-down-sort-staging");
  assert.equal(production.name, "vsn-stock-down-sort-production");
  assert.equal(staging.main, "./workers/app.js");
  assert.equal(production.main, "./workers/app.js");

  for (const config of [staging, production]) {
    assert.equal(config.assets.directory, "build/client");
    assert.ok(config.compatibility_date >= "2026-08-04");
    assert.ok(config.secrets.required.includes("DATABASE_URL"));
    assert.ok(config.secrets.required.includes("SHOPIFY_API_SECRET"));
    assert.ok(!config.secrets.required.includes("DIRECT_URL"));
  }

  assert.equal(staging.vars.APP_ENV, "staging");
  assert.equal(staging.vars.SHOPIFY_BILLING_TEST_MODE, "true");
  assert.equal(production.vars.APP_ENV, "production");
  assert.equal(production.vars.SHOPIFY_BILLING_TEST_MODE, "false");
});

test("staging deployment is manual, development-sourced, and test-billed", () => {
  const workflow = read(".github/workflows/cloudflare-staging-deploy.yml");

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\npush:/);
  assert.match(workflow, /ref: development/);
  assert.match(workflow, /APP_ENV: staging/);
  assert.match(workflow, /SHOPIFY_BILLING_TEST_MODE: "true"/);
  assert.match(workflow, /--secrets-file \.worker-secrets\.json/);
  assert.match(workflow, /rm -f \.worker-secrets\.json/);
});
