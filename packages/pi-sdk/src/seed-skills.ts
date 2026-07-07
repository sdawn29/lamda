import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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

3. **Draft a body that stands alone.** The body is everything the agent gets
   when the command runs, so write it like a good task brief: imperative voice,
   concrete steps in order, expected output stated, no context that only made
   sense in this conversation. Use argument placeholders where the command
   takes input:
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

3. **Choose the smallest sufficient toolset** for \`tools:\` from the built-in
   set — \`read\`, \`bash\`, \`edit\`, \`write\`, \`plan\`, \`todo\`, \`grep\`, \`find\`,
   \`ls\`, \`question\`. Tool gating is what actually enforces the mode's
   boundaries (the preamble only steers), so omit anything the mode shouldn't
   do — e.g. leave out \`edit\`/\`write\`/\`bash\` for a read-only mode.
   \`allowCustomTools: true\` keeps MCP/LSP/extension tools active; set it
   \`false\` to restrict the mode to the listed built-ins.

4. **Draft the preamble** — the body below the frontmatter, prepended to the
   user's messages while the mode is active. A good preamble states, in order:
   the mode's role in one opening line; how to work (workflow, priorities,
   output expectations) as short bullets; and its boundaries — what it must
   not do, and where to redirect the user for out-of-scope requests. Keep it
   tight: it occupies context on every thread that uses the mode.

5. **Write the file** at the resolved path with the \`write\` tool (create the
   \`.lamda/modes\` directory first if needed). Format:

   \`\`\`markdown
   ---
   name: Display Name
   description: One-line summary shown in the mode picker.
   tools: [read, grep, find, ls, question]
   allowCustomTools: true
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
description: Create a new lamda subagent (a delegate the assistant can launch with the task tool) under .lamda/agents. Use when the user wants to add, scaffold, or author a custom agent or subagent.
---

# Create a subagent

Author a new lamda subagent. A subagent is a markdown file under a
\`.lamda/agents\` directory; its filename (without \`.md\`) is the agent \`id\` the
main assistant passes to the \`task\` tool. The frontmatter sets identity and
toolset; the body is the agent's system prompt.

Subagents run headlessly: they cannot ask the user questions, only their final
message comes back to the caller, and they can never spawn further subagents.
A good agent definition is written for that reality.

## Steps

1. **Survey what exists.** List \`~/.lamda/agents/\` and
   \`<workspace>/.lamda/agents/\` (either may be missing — that's fine), and
   read one or two existing definitions to match their tone. The ids
   \`general\` and \`explore\` are the built-ins: a file with one of those ids
   **overrides** that built-in rather than adding a new agent — only reuse a
   built-in id if the user explicitly wants to customize it. A new agent is
   only worth creating when it's meaningfully more specific than \`general\`
   (a sharper role, a narrower toolset, or a different model).

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
     files), or Full (edits + shell). Ask when the request doesn't imply it;
     this is the agent's real permission boundary.
   - **Purpose/behavior** — only if the request leaves the agent's job or
     output genuinely ambiguous.
   - **Model** — usually skip; agents inherit the conversation's model.
     Only ask if the user hinted at wanting a specific/cheaper model.

   If the chosen id collides with an existing file, read that file and ask
   whether to replace it or pick another id — never overwrite silently.

3. **Choose the smallest sufficient toolset** for \`tools:\` from the subagent
   set — \`read\`, \`grep\`, \`find\`, \`ls\`, \`bash\`, \`edit\`, \`write\`. Tool gating
   is what actually enforces the agent's boundaries (the prompt only steers),
   so map the access answer directly: read-only → \`[read, grep, find, ls]\`;
   read + edit adds \`edit, write\`; full adds \`bash\`. \`question\`, \`todo\`,
   \`plan\`, and \`task\` are not available to subagents — never list them.

4. **Write a description that routes well.** The \`description\` is what the
   main assistant reads when deciding which agent to delegate to, so write it
   as a routing rule, not marketing: what the agent does, and when to pick it
   over the others (e.g. "Use for X; prefer over general when Y"). One or two
   sentences.

5. **Draft the system prompt** — the body below the frontmatter. Write it
   like the built-ins: an opening line stating the agent's role; 3-6 short
   bullets on how to work (method, priorities, what "done" means); then its
   boundaries (what it must not do, and what to report instead when a task
   falls outside them). Always end with the headless ground rules, in your
   own words: it cannot ask the user anything, and only its final message is
   returned — so when finished (or blocked) it must write a complete,
   self-contained report with everything the caller needs. Keep the whole
   prompt tight; it is the agent's entire context beyond the task itself.

6. **Write the file** at the resolved path with the \`write\` tool (create the
   \`.lamda/agents\` directory first if needed). Format:

   \`\`\`markdown
   ---
   name: Code Reviewer
   description: Reviews a diff or file for correctness and style issues. Use for review-only passes; prefer over general when no changes should be made.
   tools: [read, grep, find, ls]
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
   available to the \`task\` tool and editable under Settings → Agents — no
   restart needed, and later edits to the file take effect on the next spawn.
`;

const SEED_SKILLS: readonly SeedSkill[] = [
  { name: "create-prompt", content: CREATE_PROMPT_SKILL },
  { name: "create-mode", content: CREATE_MODE_SKILL },
  { name: "create-agent", content: CREATE_AGENT_SKILL },
];

/**
 * Seed lamda's bundled skills into `~/.lamda/skills/<name>/SKILL.md` when they
 * don't yet exist, so they're discoverable to the agent (and editable on disk).
 * Existing files are never overwritten — user edits always win, matching
 * {@link import("./modes.js").ensureModeFiles}. Best-effort: any filesystem
 * failure is swallowed so a read-only home dir can't break startup. Call once at
 * server startup.
 */
export function ensureSkillFiles(): void {
  for (const skill of SEED_SKILLS) {
    const dir = join(lamdaGlobalSkillsDir(), skill.name);
    const path = join(dir, "SKILL.md");
    if (existsSync(path)) continue;
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path, skill.content, "utf8");
    } catch {
      // Seeding is best-effort; the skill simply won't be available this run.
    }
  }
}
