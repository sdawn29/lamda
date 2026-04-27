/**
 * Shared formatting utilities used across the app.
 */

/**
 * Format a timestamp (ms) as a human-readable duration.
 * Examples: "200ms", "1.5s", "45s", "2m 30s"
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`

  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}

/**
 * Format a Unix timestamp (ms) as a 12-hour time string.
 * Examples: "3:45 pm", "12:00 am"
 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, "0")
  const ampm = hours >= 12 ? "pm" : "am"
  const displayHours = hours % 12 || 12
  return `${displayHours}:${minutes} ${ampm}`
}

/**
 * Format bytes as a human-readable size.
 * Examples: "256 B", "1.5 KB", "2.3 MB"
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Format a number with thousands separators.
 * Example: 1234567 -> "1,234,567"
 */
export function formatNumber(n: number): string {
  return n.toLocaleString()
}

/**
 * Format a percentage (0-1 or 0-100).
 */
export function formatPercent(value: number, decimals = 1): string {
  const percent = value <= 1 ? value * 100 : value
  return `${percent.toFixed(decimals)}%`
}
