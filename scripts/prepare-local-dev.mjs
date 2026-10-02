import fs from "node:fs";
import process from "node:process";
import { execFileSync, spawnSync } from "node:child_process";
import { loadLocalEnv, validateLocalSqliteEnv } from "./local-env.mjs";

function fail(message) {
  throw new Error(`[local-prepare] ${message}`);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });

  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}

async function main() {
  const branch = execFileSync("git", ["branch", "--show-current"], {
    encoding: "utf8",
  }).trim();

  if (branch !== "development") {
    fail(
      `Local preparation must run from development; current branch is "${branch || "detached"}".`,
    );
  }

  loadLocalEnv();
  validateLocalSqliteEnv();

  run("npx", ["prisma", "validate", "--schema", "prisma/schema.prisma"]);
  run("npx", ["prisma", "generate", "--schema", "prisma/schema.prisma"]);
  run("npx", [
    "prisma",
    "migrate",
    "deploy",
    "--schema",
    "prisma/schema.prisma",
  ]);

  if (!fs.existsSync("prisma/dev.sqlite")) {
    fail("Prisma migration completed without creating prisma/dev.sqlite.");
  }

  console.log("[local-prepare] database=sqlite");
  console.log("[local-prepare] database_file=prisma/dev.sqlite");
  console.log("[local-prepare] prisma_validate=passed");
  console.log("[local-prepare] prisma_generate=passed");
  console.log("[local-prepare] prisma_migrate_deploy=passed");
  console.log("[local-prepare] next=npm run dev");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
