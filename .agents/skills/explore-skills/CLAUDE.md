# explore-skills

Agent skills for exploring codebase structure, finding files, tracing code paths, and mapping architecture relationships in TypeScript/JavaScript projects.

## Repository Structure

```
.claude-plugin/
  plugin.json             # Plugin metadata
explore/                  # Codebase exploration skill
  SKILL.md                # Skill entry point
  references/
    directory-structure.md  # Directory maps and code patterns
```

## Creating a New Skill

1. Create a directory with a kebab-case name (e.g. `explore/`)
2. Add a `SKILL.md` with YAML frontmatter:
   - `name` (required): kebab-case skill name
   - `description` (required): Third-person, includes trigger phrases, 1-2 sentences
3. Add a `references/` directory for supplementary documentation
4. Update `.claude-plugin/plugin.json` if adding to the plugin

### SKILL.md Requirements

- Under 500 lines — keep focused, put details in references
- Include "When to Use" and "When NOT to Use" sections
- Include step-by-step workflows for common tasks
- Use progressive disclosure: SKILL.md links to reference files, references don't chain
- No hardcoded file paths

### Reference Files

- `directory-structure.md` — Directory maps, code patterns, search commands
- Add more reference files as needed for complex skills

### Naming Conventions

- Directories: kebab-case (`explore`)
- Skill names: kebab-case (`explore`)
- Reference files: kebab-case (`directory-structure.md`)

## Quality Standards

- Description must include trigger phrases ("Use when asked to...")
- Workflows must be numbered step-by-step
- Include both finding and tracing workflows
- Map relationships between layers (UI → API → Service → DB)

## PR Checklist

- [ ] SKILL.md has valid YAML frontmatter with `name` and `description`
- [ ] No hardcoded file paths
- [ ] Skill is under 500 lines
- [ ] "When to Use" and "When NOT to Use" sections present
- [ ] Workflows are numbered step-by-step
- [ ] Reference files linked from SKILL.md
- [ ] Plugin.json versions are updated
