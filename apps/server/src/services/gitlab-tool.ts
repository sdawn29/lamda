import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { GlabError } from "@lamda/gitlab";
import { gl, threadRepoCwd } from "./gitlab-service.js";

/**
 * Names of the GitLab agent tools, split by side effect. Reads are safe to
 * auto-allow; writes go through the tool-approval gate like bash/MCP tools.
 */
export const GITLAB_READ_TOOLS = [
  "gitlab_list_mrs",
  "gitlab_get_mr",
  "gitlab_list_issues",
  "gitlab_get_issue",
  "gitlab_pipelines",
] as const;

export const GITLAB_WRITE_TOOLS = [
  "gitlab_create_mr",
  "gitlab_comment_issue",
  "gitlab_comment_mr",
] as const;

export const GITLAB_TOOL_NAMES: string[] = [
  ...GITLAB_READ_TOOLS,
  ...GITLAB_WRITE_TOOLS,
];

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    details: {},
  };
}

function fail(message: string) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify({ error: message }) },
    ],
    details: {},
  };
}

function errMessage(err: unknown): string {
  if (err instanceof GlabError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
  return Number.isInteger(n) ? n : null;
}

/**
 * GitLab tools for the agent, scoped to the thread's repo (its worktree when
 * one is attached). Only registered when `glab` is installed + authenticated,
 * so the agent never sees them in a repo it can't reach.
 */
export function createGitlabTools(
  threadId: string | undefined,
  workspacePath: string,
): ToolDefinition[] {
  const cwd = () => threadRepoCwd(threadId, workspacePath);

  return [
    {
      name: "gitlab_list_mrs",
      label: "list merge requests",
      description:
        "List merge requests in the current repository on GitLab. Defaults to open MRs.",
      parameters: {
        type: "object",
        properties: {
          state: {
            type: "string",
            enum: ["opened", "closed", "merged", "all"],
            description: "Which MRs to list. Defaults to 'opened'.",
          },
        },
      },
      execute: async (_id, params) => {
        const p = (params ?? {}) as Record<string, unknown>;
        try {
          const mrs = await gl.listMergeRequests(cwd(), {
            state: (p.state as gl.MergeRequestState) ?? "opened",
          });
          return ok({ mrs });
        } catch (err) {
          return fail(errMessage(err));
        }
      },
    },
    {
      name: "gitlab_get_mr",
      label: "view merge request",
      description:
        "Get full details of a merge request: description, merge status, comments, and the latest pipeline with its jobs.",
      parameters: {
        type: "object",
        required: ["number"],
        properties: {
          number: {
            type: "number",
            description: "The merge request number (iid).",
          },
        },
      },
      execute: async (_id, params) => {
        const n = num((params as Record<string, unknown>)?.number);
        if (n == null) return fail("`number` must be a positive integer.");
        try {
          return ok({ mr: await gl.getMergeRequest(cwd(), n) });
        } catch (err) {
          return fail(errMessage(err));
        }
      },
    },
    {
      name: "gitlab_create_mr",
      label: "create merge request",
      description:
        "Open a merge request on GitLab for the current branch. The current branch is pushed to the remote automatically before the MR is opened. Provide a clear title and a description summarizing the changes.",
      parameters: {
        type: "object",
        required: ["title"],
        properties: {
          title: { type: "string", description: "Merge request title." },
          description: {
            type: "string",
            description: "Merge request description (Markdown).",
          },
          target: {
            type: "string",
            description:
              "Target branch to merge into. Defaults to the repo's default branch.",
          },
          draft: {
            type: "boolean",
            description: "Open as a draft MR. Defaults to false.",
          },
        },
      },
      execute: async (_id, params) => {
        const p = (params ?? {}) as Record<string, unknown>;
        const title = typeof p.title === "string" ? p.title.trim() : "";
        if (!title) return fail("`title` is required.");
        try {
          const result = await gl.createMergeRequest(cwd(), {
            title,
            description:
              typeof p.description === "string" ? p.description : undefined,
            targetBranch: typeof p.target === "string" ? p.target : undefined,
            draft: p.draft === true,
          });
          return ok({ created: true, url: result.url });
        } catch (err) {
          return fail(errMessage(err));
        }
      },
    },
    {
      name: "gitlab_list_issues",
      label: "list issues",
      description:
        "List issues in the current repository on GitLab. Supports an optional search query.",
      parameters: {
        type: "object",
        properties: {
          state: {
            type: "string",
            enum: ["opened", "closed", "all"],
            description: "Which issues to list. Defaults to 'opened'.",
          },
          search: {
            type: "string",
            description: "Optional full-text search query.",
          },
        },
      },
      execute: async (_id, params) => {
        const p = (params ?? {}) as Record<string, unknown>;
        try {
          const issues = await gl.listIssues(cwd(), {
            state: (p.state as gl.IssueState) ?? "opened",
            search: typeof p.search === "string" ? p.search : undefined,
          });
          return ok({ issues });
        } catch (err) {
          return fail(errMessage(err));
        }
      },
    },
    {
      name: "gitlab_get_issue",
      label: "view issue",
      description: "Get an issue's full description and comments.",
      parameters: {
        type: "object",
        required: ["number"],
        properties: {
          number: { type: "number", description: "The issue number (iid)." },
        },
      },
      execute: async (_id, params) => {
        const n = num((params as Record<string, unknown>)?.number);
        if (n == null) return fail("`number` must be a positive integer.");
        try {
          return ok({ issue: await gl.getIssue(cwd(), n) });
        } catch (err) {
          return fail(errMessage(err));
        }
      },
    },
    {
      name: "gitlab_comment_issue",
      label: "comment on issue",
      description: "Add a comment to a GitLab issue.",
      parameters: {
        type: "object",
        required: ["number", "body"],
        properties: {
          number: {
            type: "number",
            description: "The issue number (iid) to comment on.",
          },
          body: { type: "string", description: "Comment text (Markdown)." },
        },
      },
      execute: async (_id, params) => {
        const p = (params ?? {}) as Record<string, unknown>;
        const n = num(p.number);
        if (n == null) return fail("`number` must be a positive integer.");
        const body = typeof p.body === "string" ? p.body.trim() : "";
        if (!body) return fail("`body` is required.");
        try {
          await gl.commentIssue(cwd(), n, body);
          return ok({ commented: true, number: n });
        } catch (err) {
          return fail(errMessage(err));
        }
      },
    },
    {
      name: "gitlab_comment_mr",
      label: "comment on merge request",
      description: "Add a comment to a GitLab merge request.",
      parameters: {
        type: "object",
        required: ["number", "body"],
        properties: {
          number: {
            type: "number",
            description: "The merge request number (iid) to comment on.",
          },
          body: { type: "string", description: "Comment text (Markdown)." },
        },
      },
      execute: async (_id, params) => {
        const p = (params ?? {}) as Record<string, unknown>;
        const n = num(p.number);
        if (n == null) return fail("`number` must be a positive integer.");
        const body = typeof p.body === "string" ? p.body.trim() : "";
        if (!body) return fail("`body` is required.");
        try {
          await gl.commentMergeRequest(cwd(), n, body);
          return ok({ commented: true, number: n });
        } catch (err) {
          return fail(errMessage(err));
        }
      },
    },
    {
      name: "gitlab_pipelines",
      label: "ci pipelines",
      description:
        "Get the latest CI pipeline and its jobs for a merge request (by number) or the current branch. Use this to see whether the pipeline is passing before merging.",
      parameters: {
        type: "object",
        properties: {
          mr: {
            type: "number",
            description:
              "MR number (iid). Omit to use the current branch's latest pipeline.",
          },
        },
      },
      execute: async (_id, params) => {
        const p = (params ?? {}) as Record<string, unknown>;
        const mr = p.mr != null ? num(p.mr) : undefined;
        try {
          const pipeline = await gl.getPipeline(cwd(), {
            mr: mr ?? undefined,
          });
          return ok({ pipeline });
        } catch (err) {
          return fail(errMessage(err));
        }
      },
    },
  ];
}
