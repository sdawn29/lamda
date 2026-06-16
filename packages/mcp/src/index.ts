/**
 * MCP Integration for pi-coding-agent
 * 
 * This package provides MCP (Model Context Protocol) support for the pi coding agent.
 * It allows connecting to MCP servers and exposing their tools as pi tools.
 */

export { McpClient, createMcpClient } from "./client.js";
export { resolveTransportType } from "./types.js";
export type {
  McpServerConfig,
  McpTransportType,
  McpTool,
  McpToolResult,
  McpServerState,
  McpEvent,
  McpEventHandler,
  McpDiscoveryConfig,
} from "./types.js";
export {
  mcpToolNameToPiToolName,
  mcpToolToPiTool,
} from "./converter.js";
