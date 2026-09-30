import process from "node:process";
import { loadLocalEnv, validateLocalNeonEnv } from "./local-env.mjs";

try {
  loadLocalEnv();
  validateLocalNeonEnv();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
