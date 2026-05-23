/**
 * Helpers to convert between LSP types and the simpler shapes the agent /
 * client surface uses, plus a builder for pi-sdk ToolDefinitions backed by
 * an LSP request executor.
 */

import { Type } from "typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

/**
 * Build the standard set of LSP-backed agent tools.
 *
 * Currently exposes a single `lsp` tool that returns the language server's
 * current diagnostics (errors, warnings) for a file.
 */
export interface LspToolHelpers {
  /** Ensure a server is running for this file and the file is openDoc-ed. Returns false if no server available. */
  prepare(filePath: string): Promise<boolean>;
  diagnostics(filePath: string): Promise<Array<{ message: string; severity?: number; range: unknown }>>;
}

function textResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    details: {},
  };
}

function noServerResult() {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: "No language server available for this file type" }),
      },
    ],
    details: {},
  };
}

export function buildLspTools(helpers: LspToolHelpers): ToolDefinition[] {
  const fileOnlyParams = Type.Object({
    file: Type.String({ description: "Workspace-relative or absolute file path." }),
  }) as ToolDefinition["parameters"];

  return [
    {
      name: "lsp",
      label: "LSP Diagnostics",
      description:
        "Get the current diagnostics (errors, warnings) for a file from the language server.",
      promptSnippet: "[lsp] diagnostics",
      parameters: fileOnlyParams,
      execute: async (_id, params) => {
        const { file } = params as { file: string };
        if (!(await helpers.prepare(file))) return noServerResult();
        const diags = await helpers.diagnostics(file);
        return textResult({ diagnostics: diags });
      },
    },
  ];
}
