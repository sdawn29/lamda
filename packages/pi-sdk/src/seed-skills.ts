import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lamdaGlobalSkillsDir } from "./lamda-paths.js";

/**
 * Bundled skills lamda seeds into `~/.lamda/skills/<name>/SKILL.md` on startup.
 * Each is a directory-packaged Agent Skill: the frontmatter `name` +
 * `description` are surfaced to the model, which reads the body on demand when a
 * task matches. Both walk the user through creating a lamda resource and ask
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

const SEED_SKILLS: readonly SeedSkill[] = [
  { name: "create-prompt", content: CREATE_PROMPT_SKILL },
  { name: "create-mode", content: CREATE_MODE_SKILL },
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
