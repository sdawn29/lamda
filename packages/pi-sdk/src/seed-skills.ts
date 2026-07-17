import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lamdaGlobalSkillsDir } from "./lamda-paths.js";

/**
 * Bundled skills lamda seeds into `~/.lamda/skills/<name>/SKILL.md` on startup.
 * Each is a directory-packaged Agent Skill: the frontmatter `name` +
 * `description` are surfaced to the model, which reads the body on demand when a
 * task matches. Each walks the user through creating a lamda resource and asks
 * whether to write it globally or workspace-locally.
 */
interface SeedSkill {
  /** Skill id; becomes the directory name and the `/skill:<name>` command. */
  name: string;
  /** Full `SKILL.md` contents (frontmatter + instruction body). */
  content: string;
  /** Fingerprints of previous untouched generated versions safe to upgrade. */
  legacyHashes: readonly string[];
}

const CREATE_PROMPT_SKILL = `---
name: create-prompt
description: Create a new lamda prompt template (a reusable /slash-command) under .lamda/prompts. Use when the user wants to add, scaffold, save, or author a custom prompt or slash command.
---

# Create a prompt template

Author a new lamda prompt template. A prompt template is a markdown file under a
\`.lamda/prompts\` directory; its filename (without \`.md\`) becomes a slash command
the user can run as \`/<name>\`.

## Steps

1. **Survey what exists.** List \`~/.lamda/prompts/\` and
   \`<workspace>/.lamda/prompts/\` (either may be missing — that's fine) so you
   know the names already taken and the local house style.

2. **Settle name, intent, and location in one round.** Derive a short
   kebab-case \`<name>\` (lowercase letters, digits, hyphens) from the request.
   Then make a single \`question\` call covering everything still open — always
   include the **location** question (never assume a default), plus the
   name/behavior only if genuinely unclear:
   - **Global** — \`~/.lamda/prompts/<name>.md\`. Available in every workspace.
   - **Local** — \`<workspace>/.lamda/prompts/<name>.md\`. Only this workspace;
     can be committed to the repo to share with the team.

   If the chosen name collides with an existing file, read that file and ask
   whether to replace it or pick another name — never overwrite silently.

3. **Draft a body that stands alone.** The expanded body becomes the user's
   task, so make it operational rather than aspirational. State the desired
   outcome first, then necessary context, scope/non-goals, ordered work,
   evidence or inputs to inspect, validation, and the expected final output.
   Encode meaningful defaults so the command rarely needs a follow-up question,
   but stop when a missing consequential choice belongs to the user. Do not
   repeat lamda's universal safety, communication, or tool rules. Use argument
   placeholders where the command takes input:
   - \`$1\`, \`$2\`, … — positional arguments.
   - \`$@\` or \`$ARGUMENTS\` — all arguments.
   - \`\${1:-default}\` — positional arg with a fallback when missing/empty.
   - \`\${@:2}\` / \`\${@:2:3}\` — bash-style slices of the argument list.

4. **Write the file** at the resolved path with the \`write\` tool (create the
   \`.lamda/prompts\` directory first if needed). Format:

   \`\`\`markdown
   ---
   description: One-line summary shown in the slash-command list.
   argument-hint: <optional hint, e.g. "<issue-number>">
   ---

   Fix GitHub issue $1: read the issue with \`gh issue view $1\`, locate the
   relevant code, implement the fix, run the affected tests, and summarize the
   change.
   \`\`\`

   The frontmatter is optional. If \`description\` is omitted, the first line of
   the body is used. Omit \`argument-hint\` when the prompt takes no arguments.

5. **Confirm.** Tell the user the file path and that they can now run
   \`/<name>\` (with an example invocation if it takes arguments). New prompt
   files are picked up automatically — no restart needed.
`;

const CREATE_MODE_SKILL = `---
name: create-mode
description: Create a new lamda custom chat mode (its own toolset and preamble) under .lamda/modes. Use when the user wants to add, scaffold, or author a custom mode beyond the built-in ask/plan/agent modes.
---

# Create a custom mode

Author a new lamda mode. A mode is a markdown file under a \`.lamda/modes\`
directory; its filename (without \`.md\`) is the mode \`id\` shown in the mode
picker. The frontmatter sets which tools are active; the body is the preamble
prepended to the user's messages while that mode is selected.

## Steps

1. **Survey what exists.** List \`~/.lamda/modes/\` and
   \`<workspace>/.lamda/modes/\` (either may be missing — that's fine). The ids
   \`ask\`, \`plan\`, and \`agent\` are the built-ins: a file with one of those ids
   **overrides** that built-in mode rather than adding a new one — only reuse a
   built-in id if the user explicitly wants to customize it.

2. **Settle id, behavior, and location in one round.** Derive a short
   kebab-case \`<id>\` (lowercase letters, digits, hyphens) from the request.
   Then make a single \`question\` call covering everything still open — always
   include the **location** question (never assume a default), plus the
   id/behavior/toolset only if genuinely unclear:
   - **Global** — \`~/.lamda/modes/<id>.md\`. Available in every workspace.
   - **Local** — \`<workspace>/.lamda/modes/<id>.md\`. Only this workspace, and
     overrides a global mode with the same id; can be committed to share with
     the team.

   If the chosen id collides with an existing file, read that file and ask
   whether to replace it or pick another id — never overwrite silently.

3. **Choose the smallest sufficient toolset** for \`tools:\` — a single flat
   allowlist naming everything the mode may use: builtins (\`read\`, \`bash\`,
   \`edit\`, \`write\`, \`plan\`, \`todo\`, \`grep\`, \`find\`, \`ls\`), host tools
   (\`question\`, \`memory\`, \`delegate\`, \`lsp\`, \`create_automation\`), and any
   workspace custom tools (MCP, \`github_*\`, \`gitlab_*\`) by name. Only listed
   names are active. An entry ending in \`*\` is a prefix glob: e.g.
   \`mcp__github__*\` allows every tool from the "github" MCP server, including
   tools it adds later, and \`github_*\` covers all git-host GitHub tools. Tool
   gating is what actually enforces the mode's boundaries (the preamble only
   steers), so omit anything the mode shouldn't do — e.g. leave out
   \`edit\`/\`write\`/\`bash\` for a read-only mode.

   If the mode includes \`delegate\`, also set \`agents:\` — the subagent ids the
   mode may launch (omit the field to allow all). A mode without
   \`edit\`/\`write\`/\`bash\` must restrict \`agents:\` to read-only agents (e.g.
   \`[explore]\`): delegating to an agent with shell access would bypass the
   mode's own tool boundary.

4. **Draft the preamble** — the body below the frontmatter, prepended to the
   user's messages while the mode is active. Make it own only what is unique
   to this mode: outcome, ordered workflow, stopping condition, and boundaries.
   Do not duplicate universal lamda rules or full tool descriptions. Prefer a
   short tagged instruction block so its boundary is unambiguous. Keep it
   tight: it remains in the conversation context.

5. **Write the file** at the resolved path with the \`write\` tool (create the
   \`.lamda/modes\` directory first if needed). Format:

   \`\`\`markdown
   ---
   name: Display Name
   description: One-line summary shown in the mode picker.
   tools: [read, grep, find, ls, question, memory, delegate]
   agents: [explore]
   color: violet
   icon: sparkles
   ---

   Review mode — inspect code and report findings; never modify files. …
   \`\`\`

   \`color\` is one of: sky, amber, emerald, violet, rose, blue, teal, orange,
   fuchsia, slate. \`icon\` is a lucide icon name (e.g. sparkles, bot,
   list-todo, message-circle-question).

6. **Confirm.** Tell the user the file path and that the mode now appears in
   the mode picker — no restart needed, and later edits to the file take
   effect on the next message.
`;

const CREATE_AGENT_SKILL = `---
name: create-agent
description: Create a new lamda subagent (an agent the assistant can launch with the delegate tool) under .lamda/agents. Use when the user wants to add, scaffold, or author a custom agent or subagent.
---

# Create a subagent

Author a new lamda subagent. A subagent is a markdown file under a
\`.lamda/agents\` directory; its filename (without \`.md\`) is the agent \`id\` the
main assistant passes to the \`delegate\` tool. The frontmatter sets identity and
toolset; the body is the agent's system prompt.

Subagents run headlessly: they cannot ask the user questions, only their final
message comes back to the caller, and they can never spawn further subagents.
A good agent definition is written for that reality.

## Steps

1. **Survey what exists.** List \`~/.lamda/agents/\` and
   \`<workspace>/.lamda/agents/\` (either may be missing — that's fine), and
   read one or two existing definitions to match their tone. The ids
   \`general\`, \`explore\`, \`research\`, and \`reviewer\` are the built-ins:
   a file with one of those ids **overrides** that built-in rather than adding
   a new agent — only reuse a built-in id if the user explicitly wants to
   customize it. A new agent is worthwhile only when its role, context, tools,
   output, or model is meaningfully different from every built-in.

2. **Settle id, purpose, access, and location in one round.** Derive a short
   kebab-case \`<id>\` (lowercase letters, digits, hyphens) from the request.
   Then make a single \`question\` call covering everything still open —
   always include the **location** question (never assume a default), plus
   whichever of these are genuinely unclear from the request:
   - **Location** — Global (\`~/.lamda/agents/<id>.md\`, available in every
     workspace) or This workspace (\`<workspace>/.lamda/agents/<id>.md\`,
     overrides a global agent with the same id; can be committed to share
     with the team).
   - **Tool access** — Read-only (search/inspect), Read + edit (can modify
     files), or Full (edits + shell). When the request doesn't make the
     needed access clear, never guess — ask via the \`question\` tool with
     those three as the options; this is the agent's real permission
     boundary.
   - **Custom tools** — if the workspace has custom tools (memory, MCP,
     LSP, GitHub — the names shown in Settings → Agents) and the request
     doesn't make clear which of them the agent needs, add a
     \`multiSelect\` question listing them by name so the user picks which
     to include in \`tools:\` alongside the builtins.
   - **Purpose/behavior** — only if the request leaves the agent's job or
     output genuinely ambiguous.
   - **Model** — usually skip; agents inherit the conversation's model.
     Only ask if the user hinted at wanting a specific/cheaper model.

   If the chosen id collides with an existing file, read that file and ask
   whether to replace it or pick another id — never overwrite silently.

3. **Choose the smallest sufficient toolset** for \`tools:\` — one flat
   allowlist mixing builtins (\`read\`, \`grep\`, \`find\`, \`ls\`, \`bash\`, \`edit\`,
   \`write\`) and workspace custom tool names (\`memory\`, or MCP/LSP/GitHub
   names shown in Settings → Agents). Tool gating is what actually enforces
   the agent's boundaries (the prompt only steers), so map the access answer
   directly: read-only → \`[read, grep, find, ls]\`; read + edit adds
   \`edit, write\`; full adds \`bash\`. Append the custom tool names from the
   custom-tools answer if you asked; leave them out for a tightly isolated
   agent. An entry ending in \`*\` is a prefix glob (e.g. \`mcp__github__*\`
   allows every tool from that MCP server, including future ones).
   \`question\`, \`todo\`, \`plan\`, and \`delegate\` are never available to
   subagents — never list them.

4. **Write a description that routes well.** The \`description\` is what the
   main assistant reads when choosing an agent, so write a routing rule, not
   marketing: capability, ideal task shape, mutation level, and when to prefer
   it over a built-in. One or two sentences; do not repeat the system prompt.

5. **Draft the system prompt** — the body below the frontmatter. Define one
   crisp role, its evidence-first method, priorities and quality bar, explicit
   non-goals, ambiguity policy, and output contract. Avoid generic coding
   advice already supplied by the harness, and never request a capability
   absent from \`tools:\`. End with the headless contract: it cannot ask the user
   or spawn agents, intermediate work is hidden, and its final message must
   report outcome, evidence, changes, validation, assumptions, and blockers.
   Keep it compact enough that the task brief—not boilerplate—dominates context.

6. **Write the file** at the resolved path with the \`write\` tool (create the
   \`.lamda/agents\` directory first if needed). Format:

   \`\`\`markdown
   ---
   name: Code Reviewer
   description: Reviews a diff or file for correctness and style issues. Use for review-only passes; prefer over general when no changes should be made.
   tools: [read, grep, find, ls, memory]
   color: rose
   icon: search-check
   ---

   You are a meticulous code reviewer. Examine the code you are pointed at
   and report defects.

   - Read the surrounding code before judging a line; verify each finding
     against the actual behavior.
   - Rank findings by severity; skip style nits unless asked for them.
   - You must not modify files; if a fix is requested, describe it instead.

   You run headlessly: you cannot ask questions, and only your final message
   is returned — make it a complete, self-contained review.
   \`\`\`

   Add \`model: provider::model-id\` only when a specific model was chosen;
   omit it to inherit the conversation's model. \`color\` is one of: sky,
   amber, emerald, violet, rose, blue, teal, orange, fuchsia, slate. \`icon\`
   is a lucide icon name (e.g. bot, telescope, search-check, wrench,
   shield-check).

7. **Confirm.** Tell the user the file path, and that the agent is now
   available to the \`delegate\` tool and editable under Settings → Agents — no
   restart needed, and later edits to the file take effect on the next spawn.
`;

const SEED_SKILLS: readonly SeedSkill[] = [
  {
    name: "create-prompt",
    content: CREATE_PROMPT_SKILL,
    legacyHashes: [
      "fa5fb90e5eb02dc751e9a7176aa44a32c8504d41a740046baf798c904d087eba",
    ],
  },
  {
    name: "create-mode",
    content: CREATE_MODE_SKILL,
    legacyHashes: [
      "0b41392e97b47f4af7be8c999f7a2a1dff769aba3c98756873430bae86e686a0",
    ],
  },
  {
    name: "create-agent",
    content: CREATE_AGENT_SKILL,
    legacyHashes: [
      "78fb2935339eab322b4182e4d57a3f1fcf70009890f95642418987e45c3ba0ca",
    ],
  },
];

/**
 * Seed lamda's bundled skills into `~/.lamda/skills/<name>/SKILL.md` when they
 * don't yet exist, so they're discoverable to the agent (and editable on disk).
 * Existing files are never overwritten unless their content exactly matches a
 * previous generated version; user edits always win. Best-effort: any filesystem
 * failure is swallowed so a read-only home dir can't break startup. Call once at
 * server startup.
 */
export function ensureSkillFiles(): void {
  for (const skill of SEED_SKILLS) {
    const dir = join(lamdaGlobalSkillsDir(), skill.name);
    const path = join(dir, "SKILL.md");
    try {
      if (existsSync(path)) {
        const current = readFileSync(path, "utf8");
        const hash = createHash("sha256").update(current).digest("hex");
        if (!skill.legacyHashes.includes(hash)) continue;
      }
      mkdirSync(dir, { recursive: true });
      writeFileSync(path, skill.content, "utf8");
    } catch {
      // Seeding is best-effort; the skill simply won't be available this run.
    }
  }
}
