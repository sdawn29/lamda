import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import babel from "@rolldown/plugin-babel"

import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0.0.0"),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@xterm/")) {
            return "xterm"
          }

          if (id.includes("react-markdown") || id.includes("remark-gfm")) {
            return "markdown"
          }
        },
      },
    },
  },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
