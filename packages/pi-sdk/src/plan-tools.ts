import { mkdir } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import {
  createReadTool,
  createWriteTool,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { PLAN_DIR } from "./modes.js";

const PLAN_READ_TOOL = "plan_read";
const PLAN_WRITE_TOOL = "plan_write";
const MAX_PLAN_BYTES = 200 * 1024;
const PLAN_FILE_BASENAME = /^[a-z0-9]+(?:-[a-z0-9]+){1,4}\.md$/;

function toPlanFilePath(cwd: string, rawPath: unknown): { absPath: string; relPath: string } | null {
  if (typeof rawPath !== "string" || rawPath.length === 0) return null;
  const absPath = isAbsolute(rawPath) ? rawPath : resolve(cwd, rawPath);
  const relPath = relative(cwd, absPath).replace(/\\/g, "/");
  if (!relPath.startsWith(`${PLAN_DIR}/`) || relPath.includes("..")) return null;
  if (!relPath.toLowerCase().endsWith(".md")) return null;
  return { absPath, relPath };
}

function invalidPathResult() {
  return {
    content: [
      {
        type: "text" as const,
        text: `Path must be a markdown file inside ${PLAN_DIR}/`,
      },
    ],
    details: {},
  };
}

function invalidContentResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    details: {},
  };
}

function validatePlanContent(content: unknown) {
  if (typeof content !== "string") {
    return invalidContentResult("Plan content must be a string.");
  }
  const trimmed = content.trim();
  if (!trimmed) {
    return invalidContentResult("Plan content cannot be empty.");
  }
  if (Buffer.byteLength(content, "utf8") > MAX_PLAN_BYTES) {
    return invalidContentResult(`Plan content exceeds ${MAX_PLAN_BYTES} bytes.`);
  }
  return null;
}

export function createPlanModeTools(cwd: string): ToolDefinition[] {
  const readTool = createReadTool(cwd);
  const writeTool = createWriteTool(cwd);

  const planRead: ToolDefinition = {
    name: PLAN_READ_TOOL,
    label: "plan_read",
    description: `Read a saved plan markdown file from ${PLAN_DIR}/.`,
    parameters: readTool.parameters,
    execute: async (toolCallId, params, signal, onUpdate) => {
      const safeParams = (params && typeof params === "object" ? params : {}) as Record<string, unknown>;
      const pathCandidate =
        safeParams.path ?? safeParams.file_path;
      const normalized = toPlanFilePath(cwd, pathCandidate);
      if (!normalized) return invalidPathResult();
      const next = { ...safeParams, path: normalized.relPath };
      return readTool.execute(toolCallId, next as any, signal, onUpdate);
    },
  };

  const planWrite: ToolDefinition = {
    name: PLAN_WRITE_TOOL,
    label: "plan_write",
    description: `Write a markdown plan file into ${PLAN_DIR}/ only.`,
    parameters: writeTool.parameters,
    execute: async (toolCallId, params, signal, onUpdate) => {
      const safeParams = (params && typeof params === "object" ? params : {}) as Record<string, unknown>;
      const pathCandidate = safeParams.path;
      const normalized = toPlanFilePath(cwd, pathCandidate);
      if (!normalized) return invalidPathResult();
      const fileName = normalized.relPath.slice(normalized.relPath.lastIndexOf("/") + 1);
      if (!PLAN_FILE_BASENAME.test(fileName)) {
        return invalidContentResult(
          "Plan filename must be kebab-case with 2-5 words (example: `refactor-chat-state.md`).",
        );
      }
      const contentError = validatePlanContent(safeParams.content);
      if (contentError) return contentError;
      await mkdir(resolve(cwd, PLAN_DIR), { recursive: true }).catch(() => {});
      const next = { ...safeParams, path: normalized.relPath };
      return writeTool.execute(toolCallId, next as any, signal, onUpdate);
    },
  };

  return [planRead, planWrite];
}
