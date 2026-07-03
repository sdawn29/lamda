import path from "path"
import { defineConfig } from "vitest/config"

// Separate from vite.config.ts on purpose: the app config wires up the
// TanStack Router codegen plugin, Tailwind, and the React Compiler babel
// plugin, none of which the pure-function unit tests need. Keeping this
// config minimal avoids paying for that build pipeline on every test run.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
