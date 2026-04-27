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
      "react-compiler/react-compiler": reactCompiler.configs.recommended,
      "react-refresh/only-export-components": "off",
    },
    rules: {
      "react-refresh/only-export-components": "off",
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
