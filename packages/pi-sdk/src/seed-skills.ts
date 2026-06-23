import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { lamdaGlobalSkillsDir } from "./lamda-paths.js"

/**
 * Bundled skills lamda seeds into `~/.lamda/skills/<name>/SKILL.md` on startup.
 * Each is a directory-packaged Agent Skill: the frontmatter `name` +
 * `description` are surfaced to the model, which reads the body on demand when a
 * task matches. Both walk the user through creating a lamda resource and ask
 * whether to write it globally or workspace-locally.
 */
interface SeedSkill {
  /** Skill id; becomes the directory name and the `/skill:<name>` command. */
  name: string
  /** Full `SKILL.md` contents (frontmatter + instruction body). */
  content: string
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

1. **Settle the name and intent.** Pick a short kebab-case \`<name>\` (lowercase
   letters, digits, hyphens) and confirm what the prompt should make the agent
   do. Ask the user with the \`question\` tool if either is unclear.

2. **Ask where to create it.** Use the \`question\` tool to ask whether the prompt
   should be **global** or **local**, then resolve the directory:
   - **Global** — \`~/.lamda/prompts/<name>.md\`. Available in every workspace.
   - **Local** — \`<workspace>/.lamda/prompts/<name>.md\` (relative to the current
     working directory). Only available in this workspace; can be committed to
     the repo to share with the team.

   Do not assume a default — always ask.

3. **Write the file** at the resolved path with the \`write\` tool. Create the
   \`.lamda/prompts\` directory first if it does not exist. Format:

   \`\`\`markdown
   ---
   description: One-line summary shown in the slash-command list.
   argument-hint: <optional hint, e.g. "<issue-number>">
   ---

   The prompt body the agent receives when the command runs.
   \`\`\`

   The frontmatter is optional. If \`description\` is omitted, the first line of the
   body is used. Omit \`argument-hint\` when the prompt takes no arguments.

4. **Use argument placeholders** in the body when the command takes input:
   - \`$1\`, \`$2\`, … — positional arguments.
   - \`$@\` or \`$ARGUMENTS\` — all arguments.
   - \`\${1:-default}\` — positional arg with a fallback when missing/empty.
   - \`\${@:2}\` / \`\${@:2:3}\` — bash-style slices of the argument list.

5. **Confirm.** Tell the user the file path and that they can now run \`/<name>\`.
   New prompt files are picked up automatically — no restart needed.
`

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

1. **Settle the id and behavior.** Pick a short kebab-case \`<id>\` (lowercase
   letters, digits, hyphens) and confirm how the mode should behave and which
   tools it needs. Ask the user with the \`question\` tool if either is unclear.

2. **Ask where to create it.** Use the \`question\` tool to ask whether the mode
   should be **global** or **local**, then resolve the directory:
   - **Global** — \`~/.lamda/modes/<id>.md\`. Available in every workspace.
   - **Local** — \`<workspace>/.lamda/modes/<id>.md\` (relative to the current
     working directory). Only available in this workspace, and overrides a
     global mode with the same id; can be committed to share with the team.

   Do not assume a default — always ask.

3. **Write the file** at the resolved path with the \`write\` tool. Create the
   \`.lamda/modes\` directory first if it does not exist. Format:

   \`\`\`markdown
   ---
   name: Display Name
   description: One-line summary shown in the mode picker.
   tools: [read, grep, find, ls]
   allowCustomTools: true
   color: violet
   icon: sparkles
   ---

   The preamble prepended to the user's messages in this mode. Describe the
   mode's role, what it should and shouldn't do, and how to use its tools.
   \`\`\`

4. **Choose the tools** for \`tools:\` from the built-in set — \`read\`, \`bash\`,
   \`edit\`, \`write\`, \`plan\`, \`todo\`, \`grep\`, \`find\`, \`ls\`, \`question\`. Include only
   what the mode needs (e.g. omit \`edit\`/\`write\`/\`bash\` for a read-only mode).
   \`allowCustomTools: true\` keeps MCP/LSP/extension tools active; set it
   \`false\` to restrict the mode to the listed built-ins.

5. **Pick a color and icon** for the picker. \`color\` is one of: sky, amber,
   emerald, violet, rose, blue, teal, orange, fuchsia, slate. \`icon\` is a
   lucide icon name (e.g. sparkles, bot, list-todo, message-circle-question).

6. **Confirm.** Tell the user the file path and that the new mode now appears in
   the mode picker.
`

const SEED_SKILLS: readonly SeedSkill[] = [
  { name: "create-prompt", content: CREATE_PROMPT_SKILL },
  { name: "create-mode", content: CREATE_MODE_SKILL },
]

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
    const dir = join(lamdaGlobalSkillsDir(), skill.name)
    const path = join(dir, "SKILL.md")
    if (existsSync(path)) continue
    try {
      mkdirSync(dir, { recursive: true })
      writeFileSync(path, skill.content, "utf8")
    } catch {
      // Seeding is best-effort; the skill simply won't be available this run.
    }
  }
}
