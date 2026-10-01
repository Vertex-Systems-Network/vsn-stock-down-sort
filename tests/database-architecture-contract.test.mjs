import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("database topology is isolated Local -> Staging -> Production", () => {
  const topology = JSON.parse(read("config/database/environment-topology.json"));

  assert.deepEqual(topology.order, ["local", "staging", "production"]);
  assert.equal(topology.local.database.provider, "neon_postgresql");
  assert.equal(topology.local.database.project_name, "vsn-stock-down-sort-local");
  assert.equal(topology.local.database.reuse_staging_or_production, false);
  assert.equal(topology.staging.database.isolated_from_local_and_production, true);
  assert.equal(topology.production.database.isolated_from_local_and_staging, true);
});

test("active Prisma architecture is PostgreSQL and session lookup is indexed by shop", () => {
  const schema = read("prisma/cloud/schema.prisma");
  const migration = read(
    "prisma/cloud/migrations/20261001003000_session_shop_index/migration.sql",
  );

  assert.match(schema, /datasource db/);
  assert.match(schema, /provider\s*=\s*"postgresql"/);
  assert.match(schema, /model Session/);
  assert.match(schema, /@@index\(\[shop\]\)/);
  assert.match(migration, /CREATE INDEX "Session_shop_idx" ON "Session"\("shop"\)/);
});

test("database URLs remain role-separated", () => {
  const localEnv = read("scripts/local-env.mjs");

  assert.match(localEnv, /parseUrl\("DATABASE_URL"\)/);
  assert.match(localEnv, /parseUrl\("DIRECT_URL"\)/);
  assert.match(localEnv, /DATABASE_URL must be the Neon pooled\/runtime connection/);
  assert.match(localEnv, /DIRECT_URL must be the Neon direct\/non-pooled migration connection/);
  assert.match(localEnv, /same Local Neon endpoint/);
});
