import fs from "node:fs";
import process from "node:process";

function fail(message) {
  throw new Error(`[local-neon] ${message}`);
}

export function loadLocalEnv() {
  const candidates = [".env.local", ".env"];
  const selected = candidates.find((file) => fs.existsSync(file));

  if (!selected) {
    fail("Neither .env.local nor .env exists. Create .env.local from .env.local.example.");
  }

  process.loadEnvFile(selected);
  console.log(`[local-env] loaded=${selected}`);
  return selected;
}

function parseUrl(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is required for local development.`);

  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${name} must be a valid PostgreSQL URL.`);
  }

  if (!["postgresql:", "postgres:"].includes(url.protocol)) {
    fail(`${name} must use the PostgreSQL protocol.`);
  }

  const host = url.hostname.toLowerCase();
  if (!host.endsWith(".neon.tech")) {
    fail(`${name} must point to Neon for Local/Dev.`);
  }

  return { url, host };
}

function validateLocalShopifyEnv() {
  const apiKey = process.env.SHOPIFY_API_KEY?.trim();
  if (!apiKey) fail("SHOPIFY_API_KEY is required for Local/Dev.");
  if (apiKey !== "675de0e3834ce61a75473de19df457c4") {
    fail("SHOPIFY_API_KEY must match the committed Local/Dev Shopify client identity.");
  }

  const apiSecret = process.env.SHOPIFY_API_SECRET?.trim();
  if (!apiSecret) fail("SHOPIFY_API_SECRET is required for Local/Dev.");
}

function validateLocalShopifyConfig() {
  const path = "shopify.app.local.toml";
  if (!fs.existsSync(path)) fail("shopify.app.local.toml is required for Local/Dev when using --config local.");
  const config = fs.readFileSync(path, "utf8");
  if (!/name\s*=\s*"VSN \| Stock Down Sort Dev"/.test(config)) {
    fail("shopify.app.local.toml must use the dedicated VSN | Stock Down Sort Dev identity.");
  }
  if (!/client_id\s*=\s*"675de0e3834ce61a75473de19df457c4"/.test(config)) {
    fail("shopify.app.local.toml must use the committed Local/Dev Shopify client identity.");
  }
  if (!/automatically_update_urls_on_dev\s*=\s*true/.test(config)) {
    fail("Local/Dev Shopify config must allow Shopify CLI local URL updates.");
  }
}

export function validateLocalNeonEnv() {
  validateLocalShopifyConfig();
  validateLocalShopifyEnv();

  const appEnv = (process.env.APP_ENV || "development").trim().toLowerCase();
  if (appEnv !== "development") {
    fail("APP_ENV must be development for npm run dev.");
  }

  const billing = (process.env.SHOPIFY_BILLING_TEST_MODE || "true")
    .trim()
    .toLowerCase();
  if (!["true", "1", "yes"].includes(billing)) {
    fail("Local/Dev billing must remain in Shopify test mode.");
  }

  const runtime = parseUrl("DATABASE_URL");
  const direct = parseUrl("DIRECT_URL");

  if (!runtime.host.includes("-pooler.")) {
    fail("DATABASE_URL must be the Neon pooled/runtime connection.");
  }

  if (direct.host.includes("-pooler.")) {
    fail("DIRECT_URL must be the Neon direct/non-pooled migration connection.");
  }

  const runtimeEndpoint = runtime.host.split(".", 1)[0].replace(/-pooler$/, "");
  const directEndpoint = direct.host.split(".", 1)[0].replace(/-pooler$/, "");

  if (runtimeEndpoint !== directEndpoint) {
    fail("DATABASE_URL and DIRECT_URL must belong to the same Local Neon endpoint.");
  }

  if (runtime.url.toString() === direct.url.toString()) {
    fail("DATABASE_URL and DIRECT_URL must use pooled and direct Neon connections respectively.");
  }

  console.log("[local-neon] environment=development");
  console.log("[local-neon] database=neon_postgresql");
  console.log("[local-neon] pooled_runtime=pass");
  console.log("[local-neon] direct_migrations=pass");
}
