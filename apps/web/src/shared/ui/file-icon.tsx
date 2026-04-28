import type React from "react"
import { Icon, addCollection } from "@iconify/react"
import catppuccinData from "@iconify-json/catppuccin/icons.json"

addCollection(catppuccinData as Parameters<typeof addCollection>[0])

function getIconName(filename: string): string {
  const lower = filename.toLowerCase()
  const parts = lower.split(".")
  const ext = parts.length > 1 ? parts[parts.length - 1] : ""

  // Specific filenames first
  if (lower === "package.json") return "package-json"
  if (lower === "package-lock.json") return "npm-lock"
  if (lower === "yarn.lock") return "yarn-lock"
  if (lower === "pnpm-lock.yaml") return "pnpm-lock"
  if (lower === "bun.lockb") return "bun-lock"
  if (lower === "dockerfile") return "docker"
  if (lower === ".dockerignore") return "docker-ignore"
  if (lower === ".gitignore" || lower === ".gitattributes" || lower === ".gitconfig") return "git"
  if (lower === "readme.md") return "readme"
  if (lower === "changelog.md") return "changelog"
  if (lower === "license" || lower === "licence") return "license"
  if (lower === "makefile") return "makefile"
  if (lower === ".env.example" || lower === ".env.sample") return "env"
  if (lower === ".editorconfig") return "editorconfig"
  if (lower === ".eslintrc" || lower === ".eslintrc.json" || lower === ".eslintrc.js" || lower === ".eslintrc.cjs") return "eslint"
  if (lower === ".eslintignore") return "eslint-ignore"
  if (lower === ".prettierrc" || lower === ".prettierrc.json" || lower === ".prettierrc.js") return "prettier"
  if (lower === ".prettierignore") return "prettier-ignore"
  if (lower === "tailwind.config.ts" || lower === "tailwind.config.js") return "tailwind"
  if (lower === "vite.config.ts" || lower === "vite.config.js") return "vite"
  if (lower === "tsconfig.json" || lower.startsWith("tsconfig.")) return "typescript-config"
  if (lower === "cargo.toml") return "cargo"
  if (lower === "cargo.lock") return "cargo-lock"
  if (lower === "go.mod" || lower === "go.sum") return "go-mod"
  if (lower === "gemfile" || lower === "gemfile.lock") return "ruby-gem"
  if (lower === "docker-compose.yml" || lower === "docker-compose.yaml") return "docker-compose"
  if (lower === ".nvmrc" || lower === ".node-version") return "npm"
  if (lower === "deno.json" || lower === "deno.jsonc") return "deno"
  if (lower === "deno.lock") return "deno-lock"
  if (lower === "biome.json") return "biome"
  if (lower === "turbo.json") return "turbo"
  if (lower === "nx.json") return "nx"
  if (lower === "vitest.config.ts" || lower === "vitest.config.js") return "vitest"
  if (lower === "jest.config.ts" || lower === "jest.config.js") return "jest"
  if (lower === "astro.config.ts" || lower === "astro.config.mjs") return "astro-config"
  if (lower === "svelte.config.js" || lower === "svelte.config.ts") return "svelte-config"
  if (lower === "nuxt.config.ts" || lower === "nuxt.config.js") return "nuxt"
  if (lower === "next.config.ts" || lower === "next.config.js") return "next"
  if (lower === "vue.config.js" || lower === "vue.config.ts") return "vue-config"
  if (lower === ".stylelintrc" || lower === ".stylelintrc.json") return "stylelint"
  if (lower === ".stylelintignore") return "stylelint-ignore"
  if (lower === ".commitlintrc" || lower === "commitlint.config.js") return "commitlint"
  if (lower === "renovate.json") return "renovate"
  if (lower === ".npmignore") return "npm-ignore"
  if (lower === ".npmrc") return "npm"
  if (lower === "humans.txt") return "humans"
  if (lower === "robots.txt") return "robots"
  if (lower === "security.md" || lower === "security.txt") return "security"

  // Extensions
  switch (ext) {
    // TypeScript
    case "ts":
    case "mts":
    case "cts":
      return "typescript"
    case "tsx":
      return "typescript-react"
    case "d.ts":
      return "typescript-def"

    // JavaScript
    case "js":
    case "mjs":
    case "cjs":
      return "javascript"
    case "jsx":
      return "javascript-react"

    // Config files
    case "json":
    case "jsonc":
      return "json"
    case "yaml":
    case "yml":
      return "yaml"
    case "toml":
      return "toml"
    case "xml":
      return "xml"
    case "env":
      return "env"
    case "lock":
      return "lock"

    // Web
    case "html":
    case "htm":
      return "html"
    case "css":
      return "css"
    case "scss":
    case "sass":
      return "sass"
    case "less":
      return "less"
    case "svg":
      return "svg"

    // Frameworks
    case "vue":
      return "vue"
    case "svelte":
      return "svelte"
    case "astro":
      return "astro"

    // Python
    case "py":
    case "pyw":
    case "pyx":
      return "python"
    case "pyc":
      return "python-compiled"

    // Rust
    case "rs":
      return "rust"

    // Go
    case "go":
      return "go"

    // Ruby
    case "rb":
    case "erb":
    case "rake":
      return "ruby"

    // Java/JVM
    case "java":
      return "java"
    case "kt":
    case "kts":
      return "kotlin"
    case "scala":
      return "scala"
    case "groovy":
      return "groovy"
    case "jar":
      return "java-jar"

    // C/C++
    case "c":
      return "c"
    case "h":
      return "c-header"
    case "cpp":
    case "cc":
    case "cxx":
      return "cpp"
    case "hpp":
    case "hxx":
      return "cpp-header"

    // C#
    case "cs":
      return "csharp"
    case "xaml":
      return "xaml"

    // Shell
    case "sh":
    case "bash":
    case "zsh":
      return "bash"
    case "ps1":
      return "powershell"
    case "bat":
    case "cmd":
      return "batch"

    // Data
    case "sql":
      return "database"
    case "graphql":
    case "gql":
      return "graphql"
    case "csv":
    case "tsv":
      return "csv"
    case "db":
    case "sqlite":
    case "sqlite3":
      return "database"

    // Docs
    case "md":
      return "markdown"
    case "mdx":
      return "markdown-mdx"
    case "txt":
      return "text"
    case "pdf":
      return "pdf"
    case "doc":
    case "docx":
    case "odt":
    case "rtf":
      return "ms-word"
    case "xls":
    case "xlsx":
    case "ods":
      return "ms-excel"
    case "ppt":
    case "pptx":
    case "odp":
      return "ms-powerpoint"

    // Images
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "ico":
    case "bmp":
    case "tiff":
    case "tif":
    case "avif":
    case "heic":
    case "heif":
      return "image"

    // Audio
    case "mp3":
    case "wav":
    case "ogg":
    case "flac":
    case "aac":
    case "m4a":
    case "wma":
      return "audio"

    // Video
    case "mp4":
    case "avi":
    case "mkv":
    case "mov":
    case "wmv":
    case "webm":
    case "flv":
      return "video"

    // Archives
    case "zip":
    case "tar":
    case "gz":
    case "rar":
    case "7z":
    case "bz2":
    case "xz":
      return "zip"

    // Other languages
    case "php":
      return "php"
    case "swift":
      return "swift"
    case "dart":
      return "dart"
    case "r":
      return "r"
    case "lua":
      return "lua"
    case "ex":
    case "exs":
      return "elixir"
    case "erl":
    case "hrl":
      return "erlang"
    case "hs":
      return "haskell"
    case "ml":
    case "mli":
      return "ocaml"
    case "nim":
      return "nim"
    case "zig":
      return "zig"
    case "v":
      return "v"
    case "clj":
    case "cljs":
    case "cljc":
      return "clojure"
    case "jl":
      return "julia"
    case "elm":
      return "elm"
    case "gleam":
      return "gleam"
    case "tf":
    case "tfvars":
      return "terraform"
    case "nix":
      return "nix"
    case "sol":
      return "solidity"
    case "wasm":
      return "web-assembly"
    case "proto":
      return "proto"
    case "ejs":
      return "ejs"
    case "pug":
    case "jade":
      return "pug"
    case "hbs":
    case "handlebars":
      return "handlebars"
    case "jinja":
    case "jinja2":
    case "j2":
      return "jinja"
    case "twig":
      return "twig"
    case "liquid":
      return "liquid"
    case "vim":
    case "vimrc":
      return "vim"
    case "diff":
    case "patch":
      return "diff"
    case "log":
      return "log"
    case "cert":
    case "pem":
    case "crt":
    case "key":
      return "certificate"
    case "exe":
    case "dll":
    case "so":
    case "dylib":
      return "binary"
    case "ipynb":
      return "jupyter"
    case "tex":
    case "latex":
      return "latex"
    case "glsl":
    case "hlsl":
    case "frag":
    case "vert":
      return "shader"
    case "mdbook":
      return "mdbook"
    case "plist":
      return "xml"

    default:
      return "file"
  }
}

type IconProps = { className?: string }

export function getFileIcon(filename: string): (props: IconProps) => React.JSX.Element {
  const iconName = getIconName(filename.split(/[/\\]/).pop() ?? filename)
  return ({ className }: IconProps) => (
    <Icon icon={`catppuccin:${iconName}`} className={className} />
  )
}
