/**
 * Converter functions for transforming MCP tools to pi-compatible tools
 */

import { Type } from "typebox";
import type { McpTool } from "./types.js";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

/**
 * Convert an MCP tool name to a pi-compatible tool name
 * E.g., "filesystem/readFile" -> "mcp_filesystem_readFile"
 */
export function mcpToolNameToPiToolName(mcpName: string): string {
  return mcpName.replace(/[^a-zA-Z0-9_]/g, "_");
}

/**
 * Build a simple typebox schema from an MCP tool's input schema
 * Uses type assertions to bypass strict type checking for flexibility
 */
function buildSchemaFromMcpTool(mcpTool: McpTool) {
  const schema = mcpTool.inputSchema;
  
  // Build properties object from schema
  const properties: Record<string, unknown> = {};

  if (schema && typeof schema === "object" && "properties" in schema) {
    const schemaProps = (schema as { properties: Record<string, unknown> }).properties;

    for (const [key, prop] of Object.entries(schemaProps)) {
      if (prop && typeof prop === "object") {
        const propObj = prop as Record<string, unknown>;
        properties[key] = convertJsonSchemaToTypebox(propObj);
      }
    }
  }

  // Use type assertion to bypass strict TypeBox type checking
  return Type.Object(properties as Parameters<typeof Type.Object>[0]);
}

/**
 * Convert a JSON schema property to a typebox type
 */
function convertJsonSchemaToTypebox(prop: Record<string, unknown>) {
  const type = prop.type as string | undefined;
  const description = prop.description as string | undefined;

  switch (type) {
    case "string":
      return Type.String({ description });
    case "number":
      return Type.Number({ description });
    case "integer":
      return Type.Integer({ description });
    case "boolean":
      return Type.Boolean({ description });
    case "array":
      return Type.Array(Type.Any(), { description });
    case "object":
      return Type.Object({}, { description });
    default:
      return Type.Any({ description });
  }
}

/**
 * Generate a pi tool definition from an MCP tool
 */
export function mcpToolToPiTool(
  mcpTool: McpTool,
  executeCallback: (
    toolName: string,
    params: Record<string, unknown>
  ) => Promise<{
    success: boolean;
    content: Array<{ type: "text"; text: string }>;
    error?: string;
  }>
): ToolDefinition {
  const piToolName = mcpToolNameToPiToolName(mcpTool.name);
  const schema = buildSchemaFromMcpTool(mcpTool);

  return {
    name: piToolName,
    label: mcpTool.name,
    description: mcpTool.description || `MCP tool: ${mcpTool.originalName}`,
    promptSnippet: `[${mcpTool.serverName}] ${mcpTool.originalName}`,
    parameters: schema as ToolDefinition["parameters"],
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      const result = await executeCallback(mcpTool.name, params as Record<string, unknown>);

      if (!result.success) {
        return {
          content: [{ type: "text", text: result.error || "Tool call failed" }],
          details: {},
        };
      }

      return {
        content: result.content,
        details: {},
      };
    },
  };
}
