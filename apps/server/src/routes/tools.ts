import { Hono } from "hono";
import { getWorkspace } from "@lamda/db";
import { mcpServerToolPrefix } from "@lamda/mcp";

/**
 * The tool catalog: every tool a session can register, grouped by origin, for
 * the mode/agent tool-picker UIs. Groups with a stable name prefix (git-host,
 * each MCP server) carry a `glob` — the allowlist entry that covers the whole
 * group including tools it grows later. `subagent` marks tools that can be
 * granted to subagents (host chat controls and thread-bound tools can't).
 */
const tools = new Hono();

export interface CatalogToolDto {
  name: string;
  label: string;
  description?: string;
  /** Whether this tool may appear in a subagent's allowlist. */
  subagent: boolean;
}

export interface CatalogGroupDto {
  id: string;
  label: string;
  /** Allowlist glob covering this whole group (e.g. `mcp__github__*`), if any. */
  glob: string | null;
  /** Connection state, for groups backed by a live server (MCP). */
  connected?: boolean;
  tools: CatalogToolDto[];
}

// Builtins and host tools have static identities; their metadata is spelled
// out here rather than instantiating the (often thread-bound) tools.
const BUILTIN_GROUP: CatalogGroupDto = {
  id: "builtin",
  label: "Built-in",
  glob: null,
  tools: [
    { name: "read", label: "read", description: "Read files.", subagent: true },
    {
      name: "grep",
      label: "grep",
      description: "Search file contents.",
      subagent: true,
    },
    {
      name: "find",
      label: "find",
      description: "Find files by name.",
      subagent: true,
    },
    {
      name: "ls",
      label: "ls",
      description: "List directories.",
      subagent: true,
    },
    {
      name: "bash",
      label: "bash",
      description: "Run shell commands.",
      subagent: true,
    },
    {
      name: "edit",
      label: "edit",
      description: "Edit existing files.",
      subagent: true,
    },
    {
      name: "write",
      label: "write",
      description: "Create and overwrite files.",
      subagent: true,
    },
    {
      name: "todo",
      label: "todo",
      description: "Live checklist beside the chat.",
      subagent: false,
    },
    {
      name: "plan",
      label: "plan",
      description: "Read/write implementation plans in .lamda/plans/.",
      subagent: false,
    },
  ],
};

const HOST_GROUP: CatalogGroupDto = {
  id: "host",
  label: "App tools",
  glob: null,
  tools: [
    {
      name: "question",
      label: "question",
      description: "Ask the user a blocking multiple-choice question.",
      subagent: false,
    },
    {
      name: "memory",
      label: "memory",
      description: "Durable knowledge base across sessions.",
      subagent: true,
    },
    {
      name: "delegate",
      label: "delegate",
      description: "Launch subagents to work autonomously.",
      subagent: false,
    },
    {
      name: "create_automation",
      label: "create_automation",
      description: "Schedule recurring agent prompts.",
      subagent: false,
    },
    {
      name: "lsp",
      label: "lsp",
      description: "Language-server diagnostics for a file.",
      subagent: true,
    },
    {
      name: "web_fetch",
      label: "web_fetch",
      description: "Fetch a URL and read it as Markdown.",
      subagent: true,
    },
    {
      name: "semantic_search",
      label: "semantic_search",
      description: "Search workspace code by meaning.",
      subagent: true,
    },
  ],
};

tools.get("/tools", async (c) => {
  const workspaceId = c.req.query("workspaceId");
  const workspacePath = workspaceId
    ? getWorkspace(workspaceId)?.path
    : undefined;

  const groups: CatalogGroupDto[] = [BUILTIN_GROUP, HOST_GROUP];

  // Git-host groups only exist where the CLI is installed and authenticated —
  // mirrors the session-registration gate, so the picker never offers tools
  // the agent could never hold.
  if (workspacePath) {
    const [githubGroup, gitlabGroup] = await Promise.all([
      Promise.all([
        import("../services/github-service.js"),
        import("../services/github-tool.js"),
      ])
        .then(async ([svc, tool]): Promise<CatalogGroupDto | null> => {
          if (!(await svc.isGithubAvailable(workspacePath))) return null;
          return {
            id: "github",
            label: "GitHub",
            glob: "github_*",
            tools: tool
              .createGithubTools(undefined, workspacePath)
              .map((t) => ({
                name: t.name,
                label: t.label ?? t.name,
                description: t.description,
                subagent: true,
              })),
          };
        })
        .catch(() => null),
      Promise.all([
        import("../services/gitlab-service.js"),
        import("../services/gitlab-tool.js"),
      ])
        .then(async ([svc, tool]): Promise<CatalogGroupDto | null> => {
          if (!(await svc.isGitlabAvailable(workspacePath))) return null;
          return {
            id: "gitlab",
            label: "GitLab",
            glob: "gitlab_*",
            tools: tool
              .createGitlabTools(undefined, workspacePath)
              .map((t) => ({
                name: t.name,
                label: t.label ?? t.name,
                description: t.description,
                subagent: true,
              })),
          };
        })
        .catch(() => null),
    ]);
    if (githubGroup) groups.push(githubGroup);
    if (gitlabGroup) groups.push(gitlabGroup);
  }

  try {
    const { getMcpToolsByServer } = await import("../services/mcp-service.js");
    for (const server of await getMcpToolsByServer()) {
      groups.push({
        id: `mcp:${server.server}`,
        label: server.server,
        glob: `${mcpServerToolPrefix(server.server)}*`,
        connected: server.connected,
        tools: server.tools.map((t) => ({
          name: t.name,
          label: t.label ?? t.name,
          description: t.description,
          subagent: true,
        })),
      });
    }
  } catch (err) {
    console.warn("[tools] failed to load MCP tools for catalog:", err);
  }

  return c.json({ groups });
});

export default tools;
