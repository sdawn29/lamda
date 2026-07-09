import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import {
  BUILTIN_MODES,
  isValidAgentId,
  isValidModeId,
  lamdaLocalModesDir,
  lamdaModeFilePath,
  lamdaModesDir,
  listModes,
  MODE_COLORS,
  serializeModeFile,
  type ModeConfig,
} from "@lamda/pi-sdk";
import { getWorkspace } from "@lamda/db";
import { modesBroadcaster } from "../modes-broadcaster.js";
import { parseJsonBody } from "../lib/validate.js";

/**
 * Modes: the three built-ins (Ask / Plan / Agent) plus custom modes defined as
 * markdown files in `~/.lamda/modes` (global) or a workspace's
 * `<path>/.lamda/modes` (local). The files are the source of truth — these
 * routes are thin wrappers over the pi-sdk loader and serializer, mirroring
 * the agents routes. Deleting a built-in's file restores its in-code default.
 */
const modes = new Hono();

interface ModeDto {
  id: string;
  label: string;
  description: string;
  color: string;
  icon: string;
  source: ModeConfig["source"];
  builtin: boolean;
  /** Complete tool allowlist — names and `*` prefix globs mixed. */
  tools: string[];
  /** Subagent ids the delegate tool may launch; null means all agents. */
  agents: string[] | null;
  /** The mode's preamble (the markdown body of its file). */
  preamble: string;
}

function toDto(config: ModeConfig): ModeDto {
  return {
    id: config.id,
    label: config.label,
    description: config.description,
    color: config.color,
    icon: config.icon,
    source: config.source,
    builtin: (BUILTIN_MODES as readonly string[]).includes(config.id),
    tools: [...config.tools],
    agents: config.agents ? [...config.agents] : null,
    preamble: config.preamble,
  };
}

function workspacePathFor(workspaceId: string | undefined): string | undefined {
  return workspaceId ? getWorkspace(workspaceId)?.path : undefined;
}

modes.get("/modes", (c) => {
  // Scope to a workspace so its local `.lamda/modes` are included; without one,
  // only global + built-in modes are returned.
  const cwd = workspacePathFor(c.req.query("workspaceId"));
  return c.json({ modes: listModes(cwd).map(toDto) });
});

const saveModeSchema = z.object({
  scope: z.enum(["global", "local"]),
  workspaceId: z.string().optional(),
  name: z.string().trim().min(1, "name is required"),
  description: z.string().trim().min(1, "description is required"),
  tools: z.array(z.string().trim().min(1)).min(1, "at least one tool"),
  /** Null (or omitted) allows every agent; a list restricts the delegate tool. */
  agents: z.array(z.string()).nullable().optional(),
  color: z.string().trim().optional(),
  icon: z.string().trim().optional(),
  preamble: z.string().trim().min(1, "preamble is required"),
});

modes.put("/modes/:id", async (c) => {
  const id = c.req.param("id");
  if (!isValidModeId(id)) {
    return c.json(
      {
        error: "Mode id must be kebab-case (lowercase letters, digits, dashes)",
      },
      400,
    );
  }

  const parsed = await parseJsonBody(c, saveModeSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  if (
    body.color &&
    !(MODE_COLORS as readonly string[]).includes(body.color.toLowerCase())
  ) {
    return c.json(
      { error: `color must be one of: ${MODE_COLORS.join(", ")}` },
      400,
    );
  }
  const agents = body.agents ?? null;
  if (agents && agents.some((agentId) => !isValidAgentId(agentId))) {
    return c.json({ error: "agents must be valid agent ids" }, 400);
  }

  let dir: string;
  if (body.scope === "local") {
    const workspacePath = workspacePathFor(body.workspaceId);
    if (!workspacePath) {
      return c.json({ error: "workspaceId is required for local scope" }, 400);
    }
    dir = lamdaLocalModesDir(workspacePath);
  } else {
    dir = lamdaModesDir();
  }

  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `${id}.md`),
      serializeModeFile({
        label: body.name,
        description: body.description,
        preamble: body.preamble,
        tools: body.tools,
        agents,
        color: body.color?.toLowerCase() ?? "violet",
        icon: body.icon || "sparkles",
      }),
      "utf8",
    );
  } catch (err) {
    return c.json(
      {
        error: err instanceof Error ? err.message : "Failed to write mode file",
      },
      500,
    );
  }

  modesBroadcaster.broadcast();
  const cwd = workspacePathFor(body.workspaceId);
  const config = listModes(cwd).find((m) => m.id === id);
  return c.json({ mode: config ? toDto(config) : null });
});

modes.delete("/modes/:id", (c) => {
  const id = c.req.param("id");
  const scope = c.req.query("scope") === "local" ? "local" : "global";

  let path: string;
  if (scope === "local") {
    const workspacePath = workspacePathFor(c.req.query("workspaceId"));
    if (!workspacePath) {
      return c.json({ error: "workspaceId is required for local scope" }, 400);
    }
    path = join(lamdaLocalModesDir(workspacePath), `${id}.md`);
  } else {
    path = lamdaModeFilePath(id);
  }

  if (!existsSync(path)) {
    return c.json({ error: `No ${scope} file for mode "${id}"` }, 404);
  }
  try {
    unlinkSync(path);
  } catch (err) {
    return c.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to delete mode file",
      },
      500,
    );
  }

  modesBroadcaster.broadcast();
  return c.json({ ok: true });
});

export default modes;
