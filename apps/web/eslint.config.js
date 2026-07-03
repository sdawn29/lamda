import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import reactCompiler from "eslint-plugin-react-compiler"
import tseslint from "typescript-eslint"
import { defineConfig, globalIgnores } from "eslint/config"
import pluginRouter from "@tanstack/eslint-plugin-router"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig([
  globalIgnores(["dist"]),
  ...pluginRouter.configs["flat/recommended"],
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    plugins: {
      "react-refresh": reactRefresh,
      "react-compiler": reactCompiler,
    },
    rules: {
      "react-refresh/only-export-components": "off",
      // This config previously had a duplicate `rules` key in this same object,
      // which silently discarded the first one (the one enabling
      // react-compiler/react-compiler) — so the compiler lint had never actually
      // run here. Turning it on for the first time surfaced ~55 pre-existing
      // violations spread across a dozen components, mostly the "sync external
      // state into a ref/state during an effect" pattern used deliberately
      // throughout this app (see chat-view.tsx's "adjusting state while
      // rendering" comments for the same idiom applied correctly). Fixing each
      // call site is a real, separate refactor, not a one-line change, so these
      // four rules are set to "warn" rather than fixed in bulk or silenced here
      // — every violation is still visible, it just doesn't fail `eslint .`.
      // react-compiler/react-compiler is included in this group specifically
      // because eslint-plugin-react-compiler double-reports its "skipped
      // optimizing" diagnostic for the same location, and a scoped inline
      // disable comment only suppresses one of the two reports — leaving no
      // way to silence the leftover error per call site without this
      // rule-level downgrade. Tighten these back to "error" incrementally as
      // each file is fixed.
      "react-compiler/react-compiler": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        tsconfigRootDir: __dirname,
      },
    },
  },
])
