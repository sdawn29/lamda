import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import {
  BUILTIN_AGENTS,
  getAgentConfig,
  getAvailableModels,
  isValidAgentId,
  lamdaAgentFilePath,
  lamdaAgentsDir,
  lamdaLocalAgentsDir,
  listAgents,
  MODE_COLORS,
  parseFrontmatter,
  parseAgentModel,
  parseList,
  serializeAgentFile,
  SUBAGENT_TOOL_NAMES,
  SUBAGENT_DENIED_TOOL_NAMES,
  DELEGATE_TOOL_NAME,
  unquote,
  type AgentConfig,
} from "@lamda/pi-sdk";
import { getWorkspace } from "@lamda/db";
import { agentsBroadcaster } from "../agents-broadcaster.js";
import { parseJsonBody } from "../lib/validate.js";

/**
 * CRUD for subagent definitions (Settings → Agents). The markdown files in
 * `~/.lamda/agents` (global) and `<workspace>/.lamda/agents` (local) are the
 * source of truth — these routes are thin wrappers over the pi-sdk loader and
 * serializer. Deleting a built-in's file restores its in-code default.
 */
const agents = new Hono();

interface AgentDto {
  id: string;
  label: string;
  description: string;
  /** `provider::model` override, or null to inherit the conversation model. */
  model: string | null;
  /** The complete tool allowlist — builtins and custom tool names mixed. */
  tools: string[];
  color: string;
  icon: string;
  source: AgentConfig["source"];
  builtin: boolean;
  /** The agent's system prompt (the markdown body). */
  prompt: string;
}

function toDto(config: AgentConfig): AgentDto {
  return {
    id: config.id,
    label: config.label,
    description: config.description,
    model: config.model
      ? `${config.model.provider}::${config.model.model}`
      : null,
    tools: [...config.tools],
    color: config.color,
    icon: config.icon,
    source: config.source,
    builtin: (BUILTIN_AGENTS as readonly string[]).includes(config.id),
    prompt: config.systemPrompt,
  };
}

function workspacePathFor(workspaceId: string | undefined): string | undefined {
  return workspaceId ? getWorkspace(workspaceId)?.path : undefined;
}

agents.get("/agents", (c) => {
  // Scope to a workspace so its local `.lamda/agents` are included; without
  // one, only global + built-in agents are returned.
  const cwd = workspacePathFor(c.req.query("workspaceId"));
  return c.json({ agents: listAgents(cwd).map(toDto) });
});

agents.get("/agents/:id", (c) => {
  const id = c.req.param("id");
  const cwd = workspacePathFor(c.req.query("workspaceId"));
  const config = getAgentConfig(id, cwd);
  if (!config) return c.json({ error: `Unknown agent "${id}"` }, 404);
  return c.json({ agent: toDto(config) });
});

const saveAgentSchema = z.object({
  scope: z.enum(["global", "local"]),
  workspaceId: z.string().optional(),
  name: z.string().trim().min(1, "name is required"),
  description: z.string().trim().min(1, "description is required"),
  model: z.string().trim().nullish(),
  tools: z.array(z.string()).optional(),
  color: z.string().trim().optional(),
  icon: z.string().trim().optional(),
  prompt: z.string().trim().min(1, "prompt is required"),
});

const saveRawAgentSchema = z.object({
  scope: z.enum(["global", "local"]),
  workspaceId: z.string().optional(),
  content: z.string().trim().min(1, "content is required"),
});

async function validateRawAgentContent(
  content: string,
): Promise<string | null> {
  const { fields, body } = parseFrontmatter(content);
  const name = unquote(fields.get("name") ?? "").trim();
  if (!name) return "name is required";
  const description = unquote(fields.get("description") ?? "").trim();
  if (!description) return "description is required";

  const denied = new Set<string>(SUBAGENT_DENIED_TOOL_NAMES);
  const tools = (
    fields.has("tools") ? parseList(fields.get("tools")!) : []
  ).filter((name) => !denied.has(name));
  if (tools.length === 0) return "At least one tool is required";

  const modelValue = unquote(fields.get("model") ?? "").trim();
  if (modelValue) {
    const model = parseAgentModel(modelValue);
    if (!model) return 'model must be "provider::model"';
    const known = (await getAvailableModels()).some(
      (m) => m.provider === model.provider && m.id === model.model,
    );
    if (!known) return `Model "${modelValue}" is not configured`;
  }

  const color = fields.get("color");
  if (
    color &&
    !(MODE_COLORS as readonly string[]).includes(unquote(color).toLowerCase())
  ) {
    return `color must be one of: ${MODE_COLORS.join(", ")}`;
  }
  if (!body.trim()) return "prompt is required";
  return null;
}

agents.put("/agents/:id", async (c) => {
  const id = c.req.param("id");
  if (!isValidAgentId(id)) {
    return c.json(
      {
        error:
          "Agent id must be kebab-case (lowercase letters, digits, dashes)",
      },
      400,
    );
  }
  if (id === DELEGATE_TOOL_NAME) {
    return c.json({ error: `"${DELEGATE_TOOL_NAME}" is a reserved id` }, 400);
  }

  const parsed = await parseJsonBody(c, saveAgentSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  let model: AgentConfig["model"];
  if (body.model) {
    model = parseAgentModel(body.model);
    if (!model) {
      return c.json({ error: 'model must be "provider::model"' }, 400);
    }
    const known = (await getAvailableModels()).some(
      (m) => m.provider === model!.provider && m.id === model!.model,
    );
    if (!known) {
      return c.json({ error: `Model "${body.model}" is not configured` }, 400);
    }
  }

  // One flat allowlist: builtin subagent tools plus workspace custom tool
  // names. Unknown names are kept (they resolve against the workspace's
  // custom tools at spawn time); host chat controls are always stripped.
  const denied = new Set<string>(SUBAGENT_DENIED_TOOL_NAMES);
  const tools = (body.tools ?? [...SUBAGENT_TOOL_NAMES]).filter(
    (name) => !denied.has(name),
  );
  if (tools.length === 0) {
    return c.json({ error: "At least one tool is required" }, 400);
  }
  if (
    body.color &&
    !(MODE_COLORS as readonly string[]).includes(body.color.toLowerCase())
  ) {
    return c.json(
      { error: `color must be one of: ${MODE_COLORS.join(", ")}` },
      400,
    );
  }

  let dir: string;
  if (body.scope === "local") {
    const workspacePath = workspacePathFor(body.workspaceId);
    if (!workspacePath) {
      return c.json({ error: "workspaceId is required for local scope" }, 400);
    }
    dir = lamdaLocalAgentsDir(workspacePath);
  } else {
    dir = lamdaAgentsDir();
  }

  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `${id}.md`),
      serializeAgentFile({
        label: body.name,
        description: body.description,
        systemPrompt: body.prompt,
        model,
        tools,
        color: body.color?.toLowerCase() ?? "violet",
        icon: body.icon || "bot",
      }),
      "utf8",
    );
  } catch (err) {
    return c.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to write agent file",
      },
      500,
    );
  }

  agentsBroadcaster.broadcast();
  const cwd = workspacePathFor(body.workspaceId);
  const config = getAgentConfig(id, cwd);
  return c.json({ agent: config ? toDto(config) : null });
});

agents.put("/agents/:id/raw", async (c) => {
  const id = c.req.param("id");
  if (!isValidAgentId(id)) {
    return c.json(
      {
        error:
          "Agent id must be kebab-case (lowercase letters, digits, dashes)",
      },
      400,
    );
  }
  if (id === DELEGATE_TOOL_NAME) {
    return c.json({ error: `"${DELEGATE_TOOL_NAME}" is a reserved id` }, 400);
  }

  const parsed = await parseJsonBody(c, saveRawAgentSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const invalid = await validateRawAgentContent(body.content);
  if (invalid) return c.json({ error: invalid }, 400);

  let dir: string;
  if (body.scope === "local") {
    const workspacePath = workspacePathFor(body.workspaceId);
    if (!workspacePath) {
      return c.json({ error: "workspaceId is required for local scope" }, 400);
    }
    dir = lamdaLocalAgentsDir(workspacePath);
  } else {
    dir = lamdaAgentsDir();
  }

  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${id}.md`), body.content, "utf8");
  } catch (err) {
    return c.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to write agent file",
      },
      500,
    );
  }

  agentsBroadcaster.broadcast();
  const cwd = workspacePathFor(body.workspaceId);
  const config = getAgentConfig(id, cwd);
  return c.json({ agent: config ? toDto(config) : null });
});

agents.delete("/agents/:id", (c) => {
  const id = c.req.param("id");
  const scope = c.req.query("scope") === "local" ? "local" : "global";

  let path: string;
  if (scope === "local") {
    const workspacePath = workspacePathFor(c.req.query("workspaceId"));
    if (!workspacePath) {
      return c.json({ error: "workspaceId is required for local scope" }, 400);
    }
    path = join(lamdaLocalAgentsDir(workspacePath), `${id}.md`);
  } else {
    path = lamdaAgentFilePath(id);
  }

  if (!existsSync(path)) {
    return c.json({ error: `No ${scope} file for agent "${id}"` }, 404);
  }
  try {
    unlinkSync(path);
  } catch (err) {
    return c.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to delete agent file",
      },
      500,
    );
  }
  agentsBroadcaster.broadcast();
  return c.json({ deleted: true });
});

export default agents;
