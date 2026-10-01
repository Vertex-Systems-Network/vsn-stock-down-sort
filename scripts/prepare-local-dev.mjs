import process from "node:process";
import { execFileSync, spawnSync } from "node:child_process";
import {
  loadLocalEnv,
  validateLocalNeonEnv,
  verifyLocalNeonProjectBinding,
} from "./local-env.mjs";

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

  run("node", ["scripts/provision-local-neon.mjs"]);

  loadLocalEnv();
  validateLocalNeonEnv();
  const binding = await verifyLocalNeonProjectBinding();

  run("npx", [
    "prisma",
    "migrate",
    "deploy",
    "--schema",
    "prisma/cloud/schema.prisma",
  ]);

  console.log("[local-prepare] neon_project_binding=verified");
  console.log(`[local-prepare] project_id=${binding.projectId}`);
  console.log(`[local-prepare] endpoint_id=${binding.endpointId}`);
  console.log("[local-prepare] prisma_migrate_deploy=passed");
  console.log("[local-prepare] next=npm run dev");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
