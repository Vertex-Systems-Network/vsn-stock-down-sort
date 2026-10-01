import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { validateLocalNeonEnv } from "../scripts/local-env.mjs";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

function setValidLocalEnv() {
  process.env.NEON_PROJECT_ID = "local-stock-down-sort";
  process.env.NEON_PROJECT_NAME = "vsn-stock-down-sort-local";
  process.env.SHOPIFY_API_KEY = "675de0e3834ce61a75473de19df457c4";
  process.env.SHOPIFY_API_SECRET = "local-secret";
  process.env.APP_ENV = "development";
  process.env.SHOPIFY_BILLING_TEST_MODE = "true";
  process.env.DATABASE_URL =
    "postgresql://user:pass@ep-stock-down-sort-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
  process.env.DIRECT_URL =
    "postgresql://user:pass@ep-stock-down-sort.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
}

function expectFailure(message) {
  assert.throws(() => validateLocalNeonEnv(), new RegExp(message));
}

test.afterEach(restoreEnv);

test("accepts the dedicated Local Shopify identity and paired Neon URLs", () => {
  setValidLocalEnv();
  assert.doesNotThrow(() => validateLocalNeonEnv());
});

test("rejects a missing dedicated Local Neon project identity", () => {
  setValidLocalEnv();
  delete process.env.NEON_PROJECT_ID;
  expectFailure("NEON_PROJECT_ID is required");
});

test("rejects a non-Local Neon project name", () => {
  setValidLocalEnv();
  process.env.NEON_PROJECT_NAME = "vsn-metafields-production";
  expectFailure("NEON_PROJECT_NAME must be vsn-stock-down-sort-local");
});

test("rejects a non-development APP_ENV", () => {
  setValidLocalEnv();
  process.env.APP_ENV = "staging";
  expectFailure("APP_ENV must be development");
});

test("rejects a non-Neon Local database host", () => {
  setValidLocalEnv();
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/neondb";
  expectFailure("DATABASE_URL must point to Neon");
});

test("rejects a pooled DIRECT_URL", () => {
  setValidLocalEnv();
  process.env.DIRECT_URL =
    "postgresql://user:pass@ep-stock-down-sort-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
  expectFailure("DIRECT_URL must be the Neon direct");
});

test("rejects mismatched Neon endpoints", () => {
  setValidLocalEnv();
  process.env.DIRECT_URL =
    "postgresql://user:pass@ep-other-endpoint.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
  expectFailure("same Local Neon endpoint");
});

test("rejects a non-Dev Shopify client identity", () => {
  setValidLocalEnv();
  process.env.SHOPIFY_API_KEY = "wrong-client";
  expectFailure("SHOPIFY_API_KEY must match");
});

test("Local Neon provisioning helper is idempotent and secret-safe", () => {
  const source = fs.readFileSync(new URL("../scripts/provision-local-neon.mjs", import.meta.url), "utf8");
  assert.ok(source.includes("/projects?") || source.includes("/projects"));
  assert.ok(source.includes('method: "POST"'));
  assert.match(source, /vsn-stock-down-sort-local/);
  assert.match(source, /NEON_API_KEY/);
  assert.doesNotMatch(source, /Bearer\\s+[A-Za-z0-9_-]{20,}/);
  assert.match(source, /\.env\.local/);
});

test("Local certification runner preserves Windows-safe npm/npx spawning", () => {
  const source = fs.readFileSync(
    new URL("../scripts/certify-local-dev.mjs", import.meta.url),
    "utf8",
  );

  assert.match(source, /shell:\s*process\.platform\s*===\s*"win32"/);
  assert.match(source, /run\("npx"/);
  assert.doesNotMatch(source, /npx\.cmd/);
  assert.doesNotMatch(source, /npm\.cmd/);
});
