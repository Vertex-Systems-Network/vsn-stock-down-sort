import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { validateLocalSqliteEnv } from "../scripts/local-env.mjs";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

function setValidLocalEnv() {
  delete process.env.NEON_API_KEY;
  delete process.env.NEON_ORG_ID;
  delete process.env.NEON_PROJECT_ID;
  delete process.env.NEON_PROJECT_NAME;
  delete process.env.DATABASE_URL;
  delete process.env.DIRECT_URL;
  process.env.SHOPIFY_API_KEY = "675de0e3834ce61a75473de19df457c4";
  process.env.SHOPIFY_API_SECRET = "local-secret";
  process.env.SCOPES = "read_products,write_products,read_inventory,read_locations";
  process.env.APP_ENV = "development";
  process.env.SHOPIFY_BILLING_TEST_MODE = "true";
}

function expectFailure(message) {
  assert.throws(() => validateLocalSqliteEnv(), new RegExp(message));
}

test.afterEach(restoreEnv);

test("accepts the dedicated Local Shopify identity without hosted database credentials", () => {
  setValidLocalEnv();
  assert.doesNotThrow(() => validateLocalSqliteEnv());
});

test("rejects a non-development APP_ENV", () => {
  setValidLocalEnv();
  process.env.APP_ENV = "staging";
  expectFailure("APP_ENV must be development");
});

test("rejects real billing in Local development", () => {
  setValidLocalEnv();
  process.env.SHOPIFY_BILLING_TEST_MODE = "false";
  expectFailure("billing must remain in Shopify test mode");
});

test("rejects a non-Dev Shopify client identity", () => {
  setValidLocalEnv();
  process.env.SHOPIFY_API_KEY = "wrong-client";
  expectFailure("SHOPIFY_API_KEY must match");
});

test("rejects missing Local Shopify secret", () => {
  setValidLocalEnv();
  delete process.env.SHOPIFY_API_SECRET;
  expectFailure("SHOPIFY_API_SECRET is required");
});

test("rejects Local scope drift that drops location access", () => {
  setValidLocalEnv();
  process.env.SCOPES = "read_products,write_products,read_inventory";
  expectFailure("SCOPES must include read_locations");
});

test("publication permissions are optional for Local/Dev", () => {
  setValidLocalEnv();
  assert.doesNotThrow(() => validateLocalSqliteEnv());
  const localConfig = fs.readFileSync("shopify.app.local.toml", "utf8");
  assert.match(localConfig, /optional_scopes = \\["read_publications", "write_publications"\\]/);
});

test("rejects Neon account or project credentials in normal Local SQLite development", () => {
  for (const key of [
    "NEON_API_KEY",
    "NEON_ORG_ID",
    "NEON_PROJECT_ID",
    "NEON_PROJECT_NAME",
    "DIRECT_URL",
  ]) {
    setValidLocalEnv();
    process.env[key] = "forbidden-local-value";
    expectFailure(`${key} must not be set`);
  }
});

test("rejects a hosted DATABASE_URL in Local SQLite development", () => {
  setValidLocalEnv();
  process.env.DATABASE_URL =
    "postgresql://user:pass@example.neon.tech/neondb";
  expectFailure("DATABASE_URL must not point to a hosted database");
});

test("Local schema is SQLite and its database files are gitignored", () => {
  const schema = fs.readFileSync(
    new URL("../prisma/schema.prisma", import.meta.url),
    "utf8",
  );
  const gitignore = fs.readFileSync(
    new URL("../.gitignore", import.meta.url),
    "utf8",
  );

  assert.match(schema, /provider\s*=\s*"sqlite"/);
  assert.match(schema, /url\s*=\s*"file:dev\.sqlite"/);
  assert.match(gitignore, /\/prisma\/dev\.sqlite/);
  assert.match(gitignore, /\/prisma\/dev\.sqlite-journal/);
});

test("Local runner generates and migrates the SQLite schema, not the cloud schema", () => {
  const source = fs.readFileSync(
    new URL("../scripts/local-dev-runner.mjs", import.meta.url),
    "utf8",
  );

  assert.match(source, /validateLocalSqliteEnv/);
  assert.match(source, /prisma\/schema\.prisma/);
  assert.doesNotMatch(source, /prisma\/cloud\/schema\.prisma/);
  assert.doesNotMatch(source, /validateLocalNeonEnv/);
  assert.doesNotMatch(source, /NEON_API_KEY/);
  assert.match(source, /shell:\s*process\.platform\s*===\s*"win32"/);
});

test("Local prepare command is Windows-safe and contains no Neon provisioning", () => {
  const source = fs.readFileSync(
    new URL("../scripts/prepare-local-dev.mjs", import.meta.url),
    "utf8",
  );
  const pkg = JSON.parse(
    fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.equal(pkg.scripts["local:prepare"], "node scripts/prepare-local-dev.mjs");
  assert.equal(
    pkg.scripts["local:validate"],
    "node scripts/validate-local-sqlite-env.mjs",
  );
  assert.equal(pkg.scripts["local:provision-neon"], undefined);
  assert.match(source, /branch !== "development"/);
  assert.match(source, /validateLocalSqliteEnv/);
  assert.match(source, /"prisma",\s*"validate"/s);
  assert.match(source, /"prisma",\s*"generate"/s);
  assert.match(source, /"prisma",\s*"migrate",\s*"deploy"/s);
  assert.match(source, /prisma\/schema\.prisma/);
  assert.doesNotMatch(source, /provision-local-neon/);
  assert.doesNotMatch(source, /NEON_/);
  assert.match(source, /shell:\s*process\.platform\s*===\s*"win32"/);
  assert.doesNotMatch(source, /npx\.cmd/);
  assert.doesNotMatch(source, /npm\.cmd/);
});

test("Local certification is Windows-safe and requires SQLite health", () => {
  const source = fs.readFileSync(
    new URL("../scripts/certify-local-dev.mjs", import.meta.url),
    "utf8",
  );

  assert.match(source, /validateLocalSqliteEnv/);
  assert.match(source, /payload\?\.database !== "sqlite"/);
  assert.match(source, /database_provider: "sqlite"/);
  assert.match(source, /prisma\/dev\.sqlite/);
  assert.match(source, /prisma\/schema\.prisma/);
  assert.doesNotMatch(source, /NEON_/);
  assert.doesNotMatch(source, /neon_project/);
  assert.match(source, /shell:\s*process\.platform\s*===\s*"win32"/);
});


test("generated Shopify Dev linked config is gitignored", () => {
  const gitignore = fs.readFileSync(
    new URL("../.gitignore", import.meta.url),
    "utf8",
  );

  assert.match(
    gitignore,
    /^shopify\.app\.vsn-stock-down-sort-dev\.toml$/m,
  );
});
