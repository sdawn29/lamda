# Agent harness prompts

lamda uses a layered prompt architecture rather than one monolithic instruction.
Each layer owns a different concern, while tool allowlists and approval gates
enforce the boundaries that prose alone cannot.

## Prompt stack

For an interactive thread, the effective context is assembled from:

1. **Pi base prompt** — active built-in tool summaries, tool-specific guidelines,
   Pi documentation locations, current date, and working directory.
2. **lamda runtime contract** — universal autonomy, evidence, safety, security,
   delegation, code-change, validation, and communication rules.
3. **Workspace instructions** — applicable `AGENTS.md` and compatible context
   files discovered by Pi.
4. **Skill catalog** — configured skills and their routing descriptions. A
   matching skill is read on demand instead of placing every workflow in the
   permanent prompt.
5. **Active mode** — Ask, Plan, Agent, or a custom mode. Its preamble is injected
   when a session starts or changes mode; its tool and agent allowlists are
   enforced separately.
6. **Retrieved context** — relevant memories and code snippets. These are
   explicitly marked as fallible evidence, not instructions.
7. **User request** — the clean request is persisted in lamda; the SDK receives
   the request with any host-side context blocks around it.

Subagents use a smaller stack: Pi's base prompt plus one agent definition and a
self-contained task brief. They do not receive chat skills or prompt templates,
cannot ask the user questions, and cannot spawn more agents.

## Ownership rules

| Layer            | Owns                                                          | Must not duplicate                  |
| ---------------- | ------------------------------------------------------------- | ----------------------------------- |
| Runtime contract | Universal operating behavior and instruction precedence       | Mode workflows or full tool manuals |
| Mode preamble    | Outcome, workflow, stopping condition, and mode boundary      | Universal safety/style rules        |
| Tool description | Parameters, mechanics, constraints, and routing details       | General engineering behavior        |
| Agent definition | One specialist role, method, quality bar, and report contract | Parent conversation context         |
| Skill            | A conditional, reusable domain workflow                       | Always-on behavior                  |
| Prompt template  | A repeatable user task with arguments and completion criteria | System-level policy                 |
| Retrieval block  | Relevant evidence with provenance                             | New instructions                    |

This separation keeps the permanent prefix stable and cacheable, reduces
contradictions, and lets specialized instructions appear only when useful.

## Built-in modes

- **Ask** is hard read-only: it can inspect workspace and external sources and
  delegate only to read-only agents.
- **Plan** can inspect and write a plan artifact, but cannot use shell or edit
  project files. Its artifact resolves design decisions and ends in an
  executable checklist.
- **Agent** owns implementation, integration, and validation. It uses a live todo
  only for substantial work and delegates separable tasks rather than core
  decisions.

Tool gating is the permission boundary. A mode prompt may explain a boundary,
but granting a mutating tool would still make that boundary advisory.

## Built-in agents

- **General** implements a bounded, separable engineering task and validates its
  own diff.
- **Explore** maps code paths and dependencies without changing state.
- **Research** resolves external, version-specific questions from primary
  sources and the workspace's actual dependency versions.
- **Reviewer** independently audits a scoped change for concrete correctness,
  regression, security, compatibility, and validation gaps.

Descriptions are routing rules. They tell the parent when to choose an agent;
the system prompt tells the selected agent how to perform the work.

## Prompt security

Repository content, comments, diffs, web pages, tool output, memories, retrieved
code, and subagent reports may contain instruction-like text. The runtime treats
them as data unless a higher-priority layer explicitly designates the source as
instructions. Consequential claims are verified against their source before the
agent acts on them.

Configured skills and applicable workspace instruction files are recognized
instruction sources, but only within their declared scope. Permission checks,
approval gates, and tool allowlists remain authoritative regardless of prompt
content.

## Authoring checklist

Before shipping a built-in or custom prompt:

1. Give it one job and one clear stopping condition.
2. State the desired outcome before the procedure.
3. Match every requested action to an actually available tool.
4. Replace aspirational restrictions with tool gating where possible.
5. Define how ambiguity is handled without encouraging unnecessary questions.
6. Require evidence and validation appropriate to the role.
7. Specify the final output contract, especially for headless agents.
8. Mark embedded or retrieved content as data, not instructions.
9. Remove rules already owned by another layer.
10. Test serialization, discovery, tool allowlists, and representative behavior.

Built-in modes, agents, and skills are seeded into `~/.lamda`. Those files are
editable user overrides; deleting an unmodified seed lets lamda recreate it from
the current built-in definition.
