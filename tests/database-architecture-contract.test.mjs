import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

function modelMap(source) {
  const models = new Map();
  const pattern = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  for (const match of source.matchAll(pattern)) {
    const normalized = match[2]
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .join("\n");
    models.set(match[1], normalized);
  }
  return models;
}

test("database topology uses SQLite locally and isolated Neon PostgreSQL when hosted", () => {
  const topology = JSON.parse(read("config/database/environment-topology.json"));

  assert.deepEqual(topology.order, ["local", "staging", "production"]);
  assert.equal(topology.local.database.provider, "sqlite");
  assert.equal(topology.local.database.file, "prisma/dev.sqlite");
  assert.equal(topology.local.database.gitignored, true);
  assert.equal(topology.local.database.reuse_staging_or_production, false);
  assert.equal(topology.staging.database.provider, "neon_postgresql");
  assert.equal(topology.production.database.provider, "neon_postgresql");
  assert.equal(topology.staging.database.isolated_from_local_and_production, true);
  assert.equal(topology.production.database.isolated_from_local_and_staging, true);
});

test("Local and cloud Prisma providers are intentionally different", () => {
  const local = read("prisma/schema.prisma");
  const cloud = read("prisma/cloud/schema.prisma");

  assert.match(local, /provider\s*=\s*"sqlite"/);
  assert.match(local, /url\s*=\s*"file:dev\.sqlite"/);
  assert.match(cloud, /provider\s*=\s*"postgresql"/);
  assert.match(cloud, /url\s*=\s*env\("DATABASE_URL"\)/);
  assert.match(cloud, /directUrl\s*=\s*env\("DIRECT_URL"\)/);
});

test("shared Prisma models, fields and indexes stay in parity across Local and cloud", () => {
  const localModels = modelMap(read("prisma/schema.prisma"));
  const cloudModels = modelMap(read("prisma/cloud/schema.prisma"));

  assert.deepEqual([...localModels.keys()].sort(), [...cloudModels.keys()].sort());

  for (const [name, localModel] of localModels) {
    assert.equal(
      localModel,
      cloudModels.get(name),
      `Prisma model drift detected for ${name}`,
    );
  }
});

test("Session shop lookup is indexed in both Local SQLite and hosted PostgreSQL", () => {
  const localSchema = read("prisma/schema.prisma");
  const cloudSchema = read("prisma/cloud/schema.prisma");
  const localMigration = read(
    "prisma/migrations/20261001143000_session_shop_index/migration.sql",
  );
  const cloudMigration = read(
    "prisma/cloud/migrations/20261001003000_session_shop_index/migration.sql",
  );

  assert.match(localSchema, /model Session[\s\S]*@@index\(\[shop\]\)/);
  assert.match(cloudSchema, /model Session[\s\S]*@@index\(\[shop\]\)/);
  assert.match(localMigration, /CREATE INDEX "Session_shop_idx" ON "Session"\("shop"\)/);
  assert.match(cloudMigration, /CREATE INDEX "Session_shop_idx" ON "Session"\("shop"\)/);
});

test("hosted database URLs remain role-separated in cloud deployment paths", () => {
  const schema = read("prisma/cloud/schema.prisma");
  const staging = read(".github/workflows/staging-readiness.yml");
  const production = read(".github/workflows/production-readiness.yml");

  assert.match(schema, /url\s*=\s*env\("DATABASE_URL"\)/);
  assert.match(schema, /directUrl\s*=\s*env\("DIRECT_URL"\)/);
  assert.match(staging, /DATABASE_URL/);
  assert.match(staging, /DIRECT_URL/);
  assert.match(production, /DATABASE_URL/);
  assert.match(production, /DIRECT_URL/);
});
