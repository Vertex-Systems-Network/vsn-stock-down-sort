import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import { includeIgnoreFile } from "eslint/config";
import { fileURLToPath } from "node:url";
import legacy from "./.eslintrc.cjs";

const baseDirectory = fileURLToPath(new URL(".", import.meta.url));
const gitignorePath = fileURLToPath(new URL(".gitignore", import.meta.url));
const compat = new FlatCompat({
  baseDirectory,
  recommendedConfig: js.configs.recommended,
});

export default [
  includeIgnoreFile(gitignorePath),
  ...compat.config(legacy),
];
