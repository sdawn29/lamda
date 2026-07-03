// Shared flat-config base for every backend/server package (apps/server,
// packages/*). Each package's own eslint.config.js calls this with its own
// `import.meta.url` so typescript-eslint resolves that package's tsconfig,
// not this file's. Mirrors apps/desktop/eslint.config.js, the one existing
// non-web ESLint setup in the repo, so backend linting behaves consistently
// across every workspace.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export function baseConfig(tsconfigRootDir) {
  return defineConfig([
    globalIgnores(["dist"]),
    {
      files: ["**/*.ts"],
      extends: [js.configs.recommended, tseslint.configs.recommended],
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        globals: globals.node,
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      rules: {
        // Convention used throughout this codebase: prefix an intentionally
        // unused destructured/callback param with `_` (e.g. discarding a tool
        // handler's `signal`/`onUpdate` args, or a `catch (e)` that never
        // reads `e`) instead of an inline disable comment at every call site.
        "@typescript-eslint/no-unused-vars": [
          "error",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
        ],
        // Backend/SDK glue code frequently sits at an external API boundary
        // (MCP tool payloads, provider SDK responses) where the real shape
        // isn't known until runtime. Typing each of these properly is real,
        // per-callsite work — not a mechanical fix — so this is a warning
        // rather than a blocking error. Tighten incrementally per file.
        "@typescript-eslint/no-explicit-any": "warn",
        // A BOM character in a regex literal (stripping a leading BOM from file
        // content) is a deliberate, meaningful use of "irregular whitespace",
        // not a stray typo — don't flag it inside regex literals.
        "no-irregular-whitespace": ["error", { skipRegExps: true }],
      },
    },
  ]);
}
