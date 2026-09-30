import process from "node:process";
import { execFileSync } from "node:child_process";
import { spawnSync } from "node:child_process";
import { loadLocalEnv, validateLocalNeonEnv } from "./local-env.mjs";

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw result.error;
  }

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

try {
  const branch = execFileSync("git", ["branch", "--show-current"], {
    encoding: "utf8",
  }).trim();
  if (branch !== "development") {
    throw new Error(
      `[local-env] npm run dev is restricted to development; current branch is "${branch || "detached"}".`,
    );
  }

  loadLocalEnv();
  validateLocalNeonEnv();

  const mode = process.argv[2];
  if (mode === "predev") {
    run("npx", [
      "prisma",
      "generate",
      "--schema",
      "prisma/cloud/schema.prisma",
    ]);
  } else if (mode === "dev") {
    run("npx", [
      "prisma",
      "migrate",
      "deploy",
      "--schema",
      "prisma/cloud/schema.prisma",
    ]);
    run("npm", ["exec", "react-router", "dev"]);
  } else {
    throw new Error(
      "[local-env] expected mode 'predev' or 'dev'.",
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
