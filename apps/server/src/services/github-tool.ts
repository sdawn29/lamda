import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { GhError } from "@lamda/github";
import { gitPushSetUpstream } from "@lamda/git";
import { gh, threadRepoCwd } from "./github-service.js";

/**
 * Names of the GitHub agent tools, split by side effect. Reads are safe to
 * auto-allow; writes go through the tool-approval gate like bash/MCP tools.
 */
export const GITHUB_READ_TOOLS = [
  "github_list_prs",
  "github_get_pr",
  "github_list_issues",
  "github_get_issue",
  "github_checks",
] as const;

export const GITHUB_WRITE_TOOLS = [
  "github_create_pr",
  "github_comment_issue",
] as const;

export const GITHUB_TOOL_NAMES: string[] = [
  ...GITHUB_READ_TOOLS,
  ...GITHUB_WRITE_TOOLS,
];

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    details: {},
  };
}

function fail(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    details: {},
  };
}

function errMessage(err: unknown): string {
  if (err instanceof GhError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
  return Number.isInteger(n) ? n : null;
}

/**
 * GitHub tools for the agent, scoped to the thread's repo (its worktree when
 * one is attached). Only registered when `gh` is installed + authenticated, so
 * the agent never sees them in a repo it can't reach.
 */
export function createGithubTools(
  threadId: string | undefined,
  workspacePath: string,
): ToolDefinition[] {
  const cwd = () => threadRepoCwd(threadId, workspacePath);

  return [
    {
      name: "github_list_prs",
      label: "list pull requests",
      description:
        "List pull requests in the current repository on GitHub. Defaults to open PRs.",
      parameters: {
        type: "object",
        properties: {
          state: {
            type: "string",
            enum: ["open", "closed", "merged", "all"],
            description: "Which PRs to list. Defaults to 'open'.",
          },
        },
      },
      execute: async (_id, params) => {
        const p = (params ?? {}) as Record<string, unknown>;
        try {
          const prs = await gh.listPullRequests(cwd(), {
            state: (p.state as gh.PrState) ?? "open",
          });
          return ok({ prs });
        } catch (err) {
          return fail(errMessage(err));
        }
      },
    },
    {
      name: "github_get_pr",
      label: "view pull request",
      description:
        "Get full details of a pull request: body, changed files, review decision, comments, and CI checks.",
      parameters: {
        type: "object",
        required: ["number"],
        properties: {
          number: { type: "number", description: "The pull request number." },
        },
      },
      execute: async (_id, params) => {
        const n = num((params as Record<string, unknown>)?.number);
        if (n == null) return fail("`number` must be a positive integer.");
        try {
          return ok({ pr: await gh.getPullRequest(cwd(), n) });
        } catch (err) {
          return fail(errMessage(err));
        }
      },
    },
    {
      name: "github_create_pr",
      label: "create pull request",
      description:
        "Open a pull request on GitHub for the current branch. The current branch is pushed to the remote automatically before the PR is opened. Provide a clear title and a body summarizing the changes.",
      parameters: {
        type: "object",
        required: ["title"],
        properties: {
          title: { type: "string", description: "Pull request title." },
          body: {
            type: "string",
            description: "Pull request description (Markdown).",
          },
          base: {
            type: "string",
            description:
              "Base branch to merge into. Defaults to the repo's default branch.",
          },
          draft: {
            type: "boolean",
            description: "Open as a draft PR. Defaults to false.",
          },
        },
      },
      execute: async (_id, params) => {
        const p = (params ?? {}) as Record<string, unknown>;
        const title = typeof p.title === "string" ? p.title.trim() : "";
        if (!title) return fail("`title` is required.");
        const dir = cwd();
        try {
          await gitPushSetUpstream(dir);
        } catch (err) {
          return fail(
            `Could not push the branch before opening the PR: ${errMessage(err)}`,
          );
        }
        try {
          const result = await gh.createPullRequest(dir, {
            title,
            body: typeof p.body === "string" ? p.body : undefined,
            base: typeof p.base === "string" ? p.base : undefined,
            draft: p.draft === true,
          });
          return ok({ created: true, url: result.url });
        } catch (err) {
          return fail(errMessage(err));
        }
      },
    },
    {
      name: "github_list_issues",
      label: "list issues",
      description:
        "List issues in the current repository on GitHub. Supports an optional search query.",
      parameters: {
        type: "object",
        properties: {
          state: {
            type: "string",
            enum: ["open", "closed", "all"],
            description: "Which issues to list. Defaults to 'open'.",
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
          const issues = await gh.listIssues(cwd(), {
            state: (p.state as gh.IssueState) ?? "open",
            search: typeof p.search === "string" ? p.search : undefined,
          });
          return ok({ issues });
        } catch (err) {
          return fail(errMessage(err));
        }
      },
    },
    {
      name: "github_get_issue",
      label: "view issue",
      description: "Get an issue's full body and comments.",
      parameters: {
        type: "object",
        required: ["number"],
        properties: {
          number: { type: "number", description: "The issue number." },
        },
      },
      execute: async (_id, params) => {
        const n = num((params as Record<string, unknown>)?.number);
        if (n == null) return fail("`number` must be a positive integer.");
        try {
          return ok({ issue: await gh.getIssue(cwd(), n) });
        } catch (err) {
          return fail(errMessage(err));
        }
      },
    },
    {
      name: "github_comment_issue",
      label: "comment on issue",
      description: "Add a comment to a GitHub issue (or pull request).",
      parameters: {
        type: "object",
        required: ["number", "body"],
        properties: {
          number: {
            type: "number",
            description: "The issue or PR number to comment on.",
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
          await gh.commentIssue(cwd(), n, body);
          return ok({ commented: true, number: n });
        } catch (err) {
          return fail(errMessage(err));
        }
      },
    },
    {
      name: "github_checks",
      label: "ci checks",
      description:
        "Get CI / check-run status for a pull request (by number) or the PR for the current branch. Use this to see whether checks are passing before merging.",
      parameters: {
        type: "object",
        properties: {
          pr: {
            type: "number",
            description:
              "PR number. Omit to use the PR associated with the current branch.",
          },
        },
      },
      execute: async (_id, params) => {
        const p = (params ?? {}) as Record<string, unknown>;
        const pr = p.pr != null ? num(p.pr) : undefined;
        try {
          const checks = await gh.getChecks(cwd(), {
            pr: pr ?? undefined,
          });
          return ok({ checks });
        } catch (err) {
          return fail(errMessage(err));
        }
      },
    },
  ];
}
