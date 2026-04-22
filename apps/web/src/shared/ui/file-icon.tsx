import {
  File,
  FileCode,
  FileJson,
  FileText,
  FileImage,
  FileArchive,
  FileAudio,
  FileVideo,
  FileSpreadsheet,
  FileType,
  Settings,
  Package,
  Terminal,
  Database,
  FileCheck,
  ScrollText,
  Shell,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split(".")
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ""
}

/**
 * Get icon component based on file extension
 */
export function getFileIcon(filename: string): LucideIcon {
  const ext = getFileExtension(filename)

  // Configuration files
  if (ext === "json" || ext === "jsonc") return FileJson
  if (ext === "yaml" || ext === "yml") return FileType
  if (ext === "toml") return FileSpreadsheet
  if (ext === "xml") return FileCode
  if (ext === "env" || ext === "env.local" || ext === "env.development" || ext === "env.production") return Settings

  // Package/dependency files
  if (ext === "js" || ext === "mjs" || ext === "cjs") return FileCode
  if (ext === "ts" || ext === "mts" || ext === "cts") return FileCode
  if (ext === "tsx" || ext === "jsx") return FileCode
  if (filename === "package.json") return Package
  if (filename === "package-lock.json" || filename === "yarn.lock" || filename === "pnpm-lock.yaml") return Package
  if (ext === "lock") return Package
  if (filename === "bun.lockb") return Package

  // Shell/scripts
  if (ext === "sh" || ext === "bash" || ext === "zsh") return Shell
  if (ext === "ps1" || ext === "bat" || ext === "cmd") return Terminal

  // Web/frontend
  if (ext === "css" || ext === "scss" || ext === "sass" || ext === "less") return FileCode
  if (ext === "html" || ext === "htm") return FileCode
  if (ext === "vue" || ext === "svelte") return FileCode
  if (ext === "svg") return FileImage

  // Data formats
  if (ext === "sql") return Database
  if (ext === "graphql" || ext === "gql") return FileCode
  if (ext === "md" || ext === "mdx") return ScrollText
  if (ext === "txt") return FileText
  if (ext === "csv" || ext === "tsv") return FileSpreadsheet

  // Images
  if (["png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "tiff", "tif"].includes(ext)) return FileImage
  if (["avif", "heic", "heif", "svg"].includes(ext)) return FileImage

  // Media
  if (["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma"].includes(ext)) return FileAudio
  if (["mp4", "avi", "mkv", "mov", "wmv", "webm", "flv"].includes(ext)) return FileVideo

  // Archives
  if (["zip", "tar", "gz", "rar", "7z", "bz2", "xz"].includes(ext)) return FileArchive

  // Documents
  if (["pdf"].includes(ext)) return FileText
  if (["doc", "docx", "odt", "rtf"].includes(ext)) return FileText

  // Config files (specific names)
  if (filename === "README.md" || filename === "CHANGELOG.md" || filename === "LICENSE" || filename === "CONTRIBUTING.md") return ScrollText
  if (filename === ".gitignore" || filename === ".gitattributes" || filename === ".gitconfig") return FileCheck
  if (filename === "Dockerfile" || filename === ".dockerignore") return Package
  if (filename === ".env.example" || filename === ".env.sample") return Settings

  // Default to generic file
  return File
}

/**
 * Get a consistent color class for file type
 */
export function getFileColorClass(filename: string): string {
  const ext = getFileExtension(filename)

  // JavaScript/TypeScript family - yellow/amber
  if (["js", "mjs", "cjs", "ts", "mts", "cts", "tsx", "jsx"].includes(ext)) {
    return "text-yellow-500"
  }

  // Python - blue
  if (["py", "pyw", "pyx"].includes(ext)) {
    return "text-blue-500"
  }

  // Rust - orange
  if (["rs"].includes(ext)) {
    return "text-orange-500"
  }

  // Go - cyan
  if (["go"].includes(ext)) {
    return "text-cyan-500"
  }

  // Ruby - red
  if (["rb", "erb", "rake"].includes(ext)) {
    return "text-red-500"
  }

  // Configuration - gray
  if (["json", "jsonc", "yaml", "yml", "toml", "xml", "env"].includes(ext)) {
    return "text-gray-500"
  }

  // Markdown/text - muted
  if (["md", "mdx", "txt", "csv"].includes(ext)) {
    return "text-muted-foreground"
  }

  // CSS family - blue/indigo
  if (["css", "scss", "sass", "less"].includes(ext)) {
    return "text-indigo-500"
  }

  // Images - green
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"].includes(ext)) {
    return "text-green-500"
  }

  // Default
  return "text-muted-foreground/70"
}
