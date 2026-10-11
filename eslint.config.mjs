import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "node:url";
import legacy from "./.eslintrc.cjs";

const baseDirectory = fileURLToPath(new URL(".", import.meta.url));
const compat = new FlatCompat({
  baseDirectory,
  recommendedConfig: js.configs.recommended,
});

export default [
  { ignores: ["**/node_modules/**", "**/build/**", "**/dist/**", ".react-router/**", ".shopify/**", "**/.cache/**", "**/_dev/**", "**/.*"] },
  ...compat.config(legacy),
];
