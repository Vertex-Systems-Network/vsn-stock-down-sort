import process from "node:process";
import { loadLocalEnv, validateLocalSqliteEnv } from "./local-env.mjs";

try {
  loadLocalEnv();
  validateLocalSqliteEnv();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
