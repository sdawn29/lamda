import { mkdir, readdir, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  createReadTool,
  createWriteTool,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { PLAN_DIR } from "./modes.js";

export const PLAN_TOOL_NAME = "plan";
const MAX_PLAN_BYTES = 200 * 1024;
/** Longest slug we'll keep (before `.md`), so a runaway title can't make an unwieldy filename. */
const MAX_SLUG_LENGTH = 80;

interface PlanPath {
  absPath: string;
  /** Path relative to cwd, POSIX-separated, e.g. `.lamda/plans/foo.md`. */
  relPath: string;
  /** The bare `.md` filename, e.g. `foo.md`. */
  fileName: string;
}

/**
 * Resolve a caller-supplied path to a safe, flat plan file inside PLAN_DIR.
 * Forgiving by design: accepts a bare name (`refactor-chat`), a name with the
 * extension (`refactor-chat.md`), or the full relative path
 * (`.lamda/plans/refactor-chat.md`); fills in the directory and `.md` extension.
 * Returns null only when the result would escape PLAN_DIR or nest in a subdir.
 */
function toPlanFilePath(cwd: string, rawPath: unknown): PlanPath | null {
  if (typeof rawPath !== "string") return null;
  let p = rawPath.trim().replace(/\\/g, "/");
  if (!p) return null;
  if (!/\.md$/i.test(p)) p += ".md";
  // A bare filename (no separator) is interpreted as living inside PLAN_DIR.
  if (!p.includes("/")) p = `${PLAN_DIR}/${p}`;

  const absPath = isAbsolute(p) ? p : resolve(cwd, p);
  const relPath = relative(cwd, absPath).replace(/\\/g, "/");
  const prefix = `${PLAN_DIR}/`;
  if (!relPath.startsWith(prefix)) return null; // traversal or outside PLAN_DIR
  const fileName = relPath.slice(prefix.length);
  if (!fileName || fileName.includes("/")) return null; // must be flat
  if (!fileName.toLowerCase().endsWith(".md")) return null;
  return { absPath, relPath, fileName };
}

/**
 * Turn an arbitrary basename into a tidy kebab-case `.md` filename, so a plan is
 * never rejected purely for style. `My Plan!.md` → `my-plan.md`. Returns null
 * when nothing usable remains (e.g. the name was only punctuation).
 */
function slugifyFileName(fileName: string): string | null {
  const base = fileName.replace(/\.md$/i, "");
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
  return slug ? `${slug}.md` : null;
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }], details: {} };
}

function validatePlanContent(content: unknown) {
  if (typeof content !== "string") return textResult("Plan content must be a string.");
  if (!content.trim()) return textResult("Plan content cannot be empty.");
  if (Buffer.byteLength(content, "utf8") > MAX_PLAN_BYTES) {
    return textResult(`Plan content exceeds the ${Math.round(MAX_PLAN_BYTES / 1024)} KB limit.`);
  }
  return null;
}

function relativeAge(mtimeMs: number): string {
  const secs = Math.max(0, Math.floor((Date.now() - mtimeMs) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/**
 * The single Plan-mode tool. One tool, three operations:
 * - `list`  — show saved plans in `.lamda/plans/`.
 * - `read`  — read one plan by name.
 * - `write` — create or update a plan (the only file write allowed in Plan mode).
 *
 * Reads/writes are delegated to the standard read/write tools but constrained to
 * `.lamda/plans/`; paths are normalized and filenames slugified so the model
 * can't escape the directory and is never rejected purely for naming style.
 */
export function createPlanModeTools(cwd: string): ToolDefinition[] {
  const readTool = createReadTool(cwd);
  const writeTool = createWriteTool(cwd);
  const planDirAbs = resolve(cwd, PLAN_DIR);

  async function listPlans() {
    let entries: string[];
    try {
      entries = await readdir(planDirAbs);
    } catch {
      return textResult(`No plans yet — ${PLAN_DIR}/ is empty.`);
    }
    const mdFiles = entries.filter((f) => f.toLowerCase().endsWith(".md"));
    if (mdFiles.length === 0) return textResult(`No plans yet — ${PLAN_DIR}/ is empty.`);
    const rows = await Promise.all(
      mdFiles.map(async (name) => {
        try {
          const s = await stat(join(planDirAbs, name));
          return { name, size: s.size, mtimeMs: s.mtimeMs };
        } catch {
          return { name, size: 0, mtimeMs: 0 };
        }
      }),
    );
    rows.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const lines = rows.map(
      (r) => `- ${r.name} (${Math.max(1, Math.round(r.size / 1024))} KB, ${relativeAge(r.mtimeMs)})`,
    );
    return textResult(`Plans in ${PLAN_DIR}/:\n${lines.join("\n")}`);
  }

  const plan: ToolDefinition = {
    name: PLAN_TOOL_NAME,
    label: "plan",
    description: `Manage implementation plans in ${PLAN_DIR}/ — the only place you may write in Plan mode.

Operations (the \`operation\` field):
- list  — Show saved plans (name, size, last modified). Use first to discover existing plans.
- read  — Read one plan. Required: \`path\` (the plan's name, e.g. \`refactor-chat.md\`; directory and \`.md\` are optional).
- write — Create or update a plan. Required: \`path\` (short kebab-case name, e.g. \`refactor-chat-state.md\`) and \`content\` (full markdown). The name is normalized and the directory/extension are added automatically; to revise an existing plan, write to its existing name.`,
    promptSnippet: `${PLAN_TOOL_NAME}: list/read/write implementation plans in ${PLAN_DIR}/.`,
    parameters: Type.Object({
      operation: Type.Union(
        [Type.Literal("list"), Type.Literal("read"), Type.Literal("write")],
        { description: "Which plan operation to perform." },
      ),
      path: Type.Optional(
        Type.String({
          description:
            "Plan name (e.g. `refactor-chat.md`); directory and `.md` are optional. Required for read and write.",
        }),
      ),
      content: Type.Optional(
        Type.String({ description: "Full markdown plan content. Required for write." }),
      ),
    }),
    execute: async (toolCallId, params, signal, onUpdate) => {
      const p = (params && typeof params === "object" ? params : {}) as Record<string, unknown>;
      const operation = p.operation;

      if (operation === "list") {
        return listPlans();
      }

      if (operation === "read") {
        const normalized = toPlanFilePath(cwd, p.path);
        if (!normalized) {
          return textResult(
            `\`read\` requires \`path\` — the plan's name (e.g. \`my-plan.md\`). Use operation "list" to see existing plans.`,
          );
        }
        return readTool.execute(toolCallId, { path: normalized.relPath } as never, signal, onUpdate);
      }

      if (operation === "write") {
        const normalized = toPlanFilePath(cwd, p.path);
        if (!normalized) {
          return textResult(
            "`write` requires `path` — a markdown plan name (e.g. `my-plan.md`); plans are written inside `" +
              PLAN_DIR +
              "/` only.",
          );
        }
        const slug = slugifyFileName(normalized.fileName);
        if (!slug) {
          return textResult(
            "Could not derive a filename — use a short kebab-case name like `refactor-chat-state.md`.",
          );
        }
        const contentError = validatePlanContent(p.content);
        if (contentError) return contentError;

        const relPath = `${PLAN_DIR}/${slug}`;
        await mkdir(planDirAbs, { recursive: true }).catch(() => {});
        const result = await writeTool.execute(
          toolCallId,
          { path: relPath, content: p.content } as never,
          signal,
          onUpdate,
        );
        // Tell the model the canonical path it was saved to (it may differ from
        // the requested name after normalization), so a later update hits the
        // same file.
        const content = Array.isArray((result as { content?: unknown }).content)
          ? (result as { content: { type: "text"; text: string }[] }).content
          : [];
        return {
          ...result,
          content: [...content, { type: "text" as const, text: `Plan saved to ${relPath}` }],
        };
      }

      return textResult(`Unknown operation. Use one of: "list", "read", "write".`);
    },
  };

  return [plan];
}
