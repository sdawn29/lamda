import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createMemoryTool } from "@lamda/pi-sdk";

/**
 * Workspace custom tools subagents may opt into. Deliberately excludes host
 * chat controls (`task`, `question`, `todo`, `plan`) because subagents run
 * headlessly inside a parent turn.
 */
export async function collectSubagentCustomTools(
  workspaceId: string | undefined,
  workspacePath: string,
  parentThreadId?: string,
): Promise<ToolDefinition[]> {
  const tools: ToolDefinition[] = [createMemoryTool(workspaceId)];
  if (!workspaceId) return tools;

  const [mcpTools, lspTools, githubTools, gitlabTools] = await Promise.all([
    import("./mcp-service.js")
      .then((m) => m.getMcpToolsForSession())
      .catch((err) => {
        console.warn("[subagent-custom-tools] failed to load MCP tools:", err);
        return [];
      }),
    import("./language-service.js")
      .then((m) => m.getLspToolsForSession(workspaceId, workspacePath))
      .catch((err) => {
        console.warn("[subagent-custom-tools] failed to load LSP tools:", err);
        return [];
      }),
    Promise.all([import("./github-service.js"), import("./github-tool.js")])
      .then(async ([svc, tool]) => {
        const cwd = svc.threadRepoCwd(parentThreadId, workspacePath);
        if (!(await svc.isGithubAvailable(cwd))) return [];
        return tool.createGithubTools(parentThreadId, workspacePath);
      })
      .catch((err) => {
        console.warn(
          "[subagent-custom-tools] failed to load GitHub tools:",
          err,
        );
        return [];
      }),
    Promise.all([import("./gitlab-service.js"), import("./gitlab-tool.js")])
      .then(async ([svc, tool]) => {
        const cwd = svc.threadRepoCwd(parentThreadId, workspacePath);
        if (!(await svc.isGitlabAvailable(cwd))) return [];
        return tool.createGitlabTools(parentThreadId, workspacePath);
      })
      .catch((err) => {
        console.warn(
          "[subagent-custom-tools] failed to load GitLab tools:",
          err,
        );
        return [];
      }),
  ]);

  return [...tools, ...mcpTools, ...lspTools, ...githubTools, ...gitlabTools];
}
