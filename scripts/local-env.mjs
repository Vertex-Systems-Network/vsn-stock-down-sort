import fs from "node:fs";
import process from "node:process";

const REQUIRED_SHOPIFY_SCOPES = [
  "read_products",
  "write_products",
  "read_inventory",
  "read_publications",
  "write_publications",
];

function fail(message) {
  throw new Error(`[local-sqlite] ${message}`);
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

function validateLocalShopifyEnv() {
  const apiKey = process.env.SHOPIFY_API_KEY?.trim();
  if (!apiKey) fail("SHOPIFY_API_KEY is required for Local/Dev.");
  if (apiKey !== "675de0e3834ce61a75473de19df457c4") {
    fail("SHOPIFY_API_KEY must match the committed Local/Dev Shopify client identity.");
  }

  const apiSecret = process.env.SHOPIFY_API_SECRET?.trim();
  if (!apiSecret) fail("SHOPIFY_API_SECRET is required for Local/Dev.");

  const scopes = new Set(
    (process.env.SCOPES || "")
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
  );
  for (const scope of REQUIRED_SHOPIFY_SCOPES) {
    if (!scopes.has(scope)) {
      fail(`SCOPES must include ${scope} for Local/Dev.`);
    }
  }
}

function validateLocalShopifyConfig() {
  const path = "shopify.app.local.toml";
  if (!fs.existsSync(path)) {
    fail("shopify.app.local.toml is required for Local/Dev when using --config local.");
  }

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
  for (const scope of REQUIRED_SHOPIFY_SCOPES) {
    if (!config.includes(scope)) {
      fail(`shopify.app.local.toml must include ${scope}.`);
    }
  }
}

function validateLocalSqliteSchema() {
  const schemaPath = "prisma/schema.prisma";
  if (!fs.existsSync(schemaPath)) fail("prisma/schema.prisma is required for Local SQLite.");

  const schema = fs.readFileSync(schemaPath, "utf8");
  if (!/provider\s*=\s*"sqlite"/.test(schema)) {
    fail("prisma/schema.prisma must use the SQLite provider for Local/Dev.");
  }
  if (!/url\s*=\s*"file:dev\.sqlite"/.test(schema)) {
    fail('prisma/schema.prisma must use the Local SQLite file "file:dev.sqlite".');
  }

  const gitignore = fs.readFileSync(".gitignore", "utf8");
  if (!gitignore.includes("/prisma/dev.sqlite")) {
    fail("prisma/dev.sqlite must remain gitignored.");
  }
  if (!gitignore.includes("/prisma/dev.sqlite-journal")) {
    fail("prisma/dev.sqlite-journal must remain gitignored.");
  }
}

function rejectHostedDatabaseCredentials() {
  const hostedKeys = [
    "NEON_API_KEY",
    "NEON_ORG_ID",
    "NEON_PROJECT_ID",
    "NEON_PROJECT_NAME",
    "DIRECT_URL",
  ];

  for (const key of hostedKeys) {
    if (process.env[key]?.trim()) {
      fail(`${key} must not be set for normal Local SQLite development.`);
    }
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl && !databaseUrl.startsWith("file:")) {
    fail("DATABASE_URL must not point to a hosted database during Local SQLite development.");
  }
}

export function validateLocalSqliteEnv() {
  validateLocalShopifyConfig();
  validateLocalShopifyEnv();
  validateLocalSqliteSchema();
  rejectHostedDatabaseCredentials();

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

  console.log("[local-sqlite] environment=development");
  console.log("[local-sqlite] database=sqlite");
  console.log("[local-sqlite] database_file=prisma/dev.sqlite");
  console.log("[local-sqlite] hosted_database_credentials=absent");
}
