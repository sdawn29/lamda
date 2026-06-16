/**
 * MCP server configuration types
 */

/**
 * Transport used to reach an MCP server.
 * - `stdio`: spawn a local process (default).
 * - `http`: remote server over Streamable HTTP.
 * - `sse`: remote server over legacy HTTP+SSE.
 */
export type McpTransportType = "stdio" | "http" | "sse"

/**
 * Configuration for an MCP server connection
 */
export interface McpServerConfig {
  /** Unique name for this server */
  name: string
  /** Transport type. Defaults to "stdio". */
  transport?: McpTransportType
  /** Command to run (e.g., "npx", "node", "python") — stdio only */
  command?: string
  /** Arguments to pass to the command — stdio only */
  args?: string[]
  /** Environment variables — stdio only */
  env?: Record<string, string>
  /** Working directory for the server process — stdio only */
  cwd?: string
  /** Endpoint URL — http/sse only */
  url?: string
  /** Extra HTTP headers (e.g. Authorization) — http/sse only */
  headers?: Record<string, string>
  /** Optional description */
  description?: string
  /** Whether the server is enabled (default: true) */
  enabled?: boolean
}

/**
 * MCP server discovery configuration
 * Supports standard mcp.json format
 */
export interface McpDiscoveryConfig {
  /** Array of server configurations */
  servers: McpServerConfig[]
}

/**
 * A tool exposed by an MCP server
 */
export interface McpTool {
  /** Unique name including server prefix */
  name: string
  /** Human-readable description */
  description?: string
  /** Server name this tool belongs to */
  serverName: string
}

/**
 * MCP server connection state
 */
export interface McpServerState {
  /** Server name */
  name: string
  /** Whether the server is currently connected */
  connected: boolean
  /** Number of tools available */
  toolCount: number
  /** Error message if connection failed */
  error?: string
  /** Whether the server is enabled */
  enabled?: boolean
}

/**
 * Server edit form state
 */
export interface ServerFormState {
  name: string
  transport: McpTransportType
  command: string
  args: string
  envVars: Array<{ key: string; value: string }>
  cwd: string
  url: string
  headers: Array<{ key: string; value: string }>
  description: string
}

/**
 * Default empty form state for adding a new server
 */
export function createEmptyServerForm(): ServerFormState {
  return {
    name: "",
    transport: "stdio",
    command: "npx",
    args: "",
    envVars: [],
    cwd: "",
    url: "",
    headers: [],
    description: "",
  }
}

/**
 * Convert form state to server config
 */
export function formStateToConfig(form: ServerFormState): McpServerConfig {
  const isHttp = form.transport === "http" || form.transport === "sse"

  return {
    name: form.name,
    transport: form.transport,
    command: !isHttp ? form.command : undefined,
    args: !isHttp && form.args ? form.args.split(" ").filter(Boolean) : undefined,
    env:
      !isHttp && form.envVars.length > 0
        ? Object.fromEntries(form.envVars.filter((v) => v.key && v.value).map((v) => [v.key, v.value]))
        : undefined,
    cwd: !isHttp ? form.cwd || undefined : undefined,
    url: isHttp ? form.url || undefined : undefined,
    headers:
      isHttp && form.headers.length > 0
        ? Object.fromEntries(form.headers.filter((v) => v.key && v.value).map((v) => [v.key, v.value]))
        : undefined,
    description: form.description || undefined,
  }
}

/**
 * Convert server config to form state
 */
export function configToFormState(config: McpServerConfig): ServerFormState {
  return {
    name: config.name,
    transport: config.transport ?? (config.url ? "http" : "stdio"),
    command: config.command ?? "npx",
    args: config.args?.join(" ") ?? "",
    envVars: Object.entries(config.env ?? {}).map(([key, value]) => ({
      key,
      value,
    })),
    cwd: config.cwd ?? "",
    url: config.url ?? "",
    headers: Object.entries(config.headers ?? {}).map(([key, value]) => ({
      key,
      value,
    })),
    description: config.description ?? "",
  }
}