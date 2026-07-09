/**
 * Converter functions for transforming MCP tools to pi-compatible tools
 */

import { Type, type TSchema } from "typebox";
import type { McpTool } from "./types.js";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

/** Prefix that marks a registered tool as originating from an MCP server. */
export const MCP_TOOL_PREFIX = "mcp__";

function sanitizeMcpNamePart(part: string): string {
  return part.replace(/[^a-zA-Z0-9_]/g, "_");
}

/**
 * The registered-name prefix shared by every tool from `serverName`, e.g.
 * `mcp__github__`. Appending `*` makes the allowlist glob that covers the
 * whole server, including tools it adds later (see tool allowlists in
 * @lamda/pi-sdk).
 */
export function mcpServerToolPrefix(serverName: string): string {
  return `${MCP_TOOL_PREFIX}${sanitizeMcpNamePart(serverName)}__`;
}

/**
 * Convert an MCP tool to its pi-registered name:
 * `mcp__<server>__<tool>`, e.g. ("filesystem", "readFile") ->
 * "mcp__filesystem__readFile".
 *
 * The `mcp__` prefix namespaces MCP tools away from built-ins (so an MCP tool
 * named e.g. "read" can't collide); the double-underscore server segment keeps
 * same-named tools from different servers apart and gives each server a stable
 * prefix that allowlists can match on.
 */
export function mcpToolNameToPiToolName(
  serverName: string,
  toolName: string,
): string {
  return mcpServerToolPrefix(serverName) + sanitizeMcpNamePart(toolName);
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
    const schemaProps = (schema as { properties: Record<string, unknown> })
      .properties;

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
function convertJsonSchemaToTypebox(prop: Record<string, unknown>): TSchema {
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
    case "array": {
      const items = prop.items as Record<string, unknown> | undefined;
      const itemType = items ? convertJsonSchemaToTypebox(items) : Type.Any();
      return Type.Array(itemType, { description });
    }
    case "object": {
      const nestedProps: Record<string, unknown> = {};
      if (prop.properties && typeof prop.properties === "object") {
        for (const [k, v] of Object.entries(
          prop.properties as Record<string, unknown>,
        )) {
          if (v && typeof v === "object") {
            nestedProps[k] = convertJsonSchemaToTypebox(
              v as Record<string, unknown>,
            );
          }
        }
      }
      return Type.Object(nestedProps as Parameters<typeof Type.Object>[0], {
        description,
      });
    }
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
    params: Record<string, unknown>,
  ) => Promise<{
    success: boolean;
    content: Array<{ type: "text"; text: string }>;
    error?: string;
  }>,
): ToolDefinition {
  const piToolName = mcpToolNameToPiToolName(
    mcpTool.serverName,
    mcpTool.originalName,
  );
  const schema = buildSchemaFromMcpTool(mcpTool);

  return {
    name: piToolName,
    label: mcpTool.name,
    description: mcpTool.description || `MCP tool: ${mcpTool.originalName}`,
    promptSnippet: `[${mcpTool.serverName}] ${mcpTool.originalName}`,
    parameters: schema as ToolDefinition["parameters"],
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      const result = await executeCallback(
        mcpTool.name,
        params as Record<string, unknown>,
      );

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
