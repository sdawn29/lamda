# Skills

Skills are reusable instructions and workflows that extend how the agent works. Installed skills are saved globally and are available to every workspace.

> Screenshot needed: capture `/skills` with popular skills, installed skills, and the search field visible.

## Browse Skills

1. Open `/skills`.
2. Review popular skills.
3. Type at least two characters in search to query the catalog.
4. Click a skill to inspect details.

## Install a Skill

1. Find a skill on `/skills`.
2. Click install.
3. Wait for the install job to complete.
4. Confirm it appears under `Installed`.

Installed skills are saved to `~/.lamda/skills`.

## Remove a Skill

1. Open `/skills`.
2. Find the skill under `Installed`.
3. Choose remove.
4. Confirm the skill disappears from installed skills.

## View Skill Details

1. Click a skill card.
2. The app opens `/skills/<id>`.
3. Review the source, description, and install state.

> Screenshot needed: capture `/skills/<id>` for an installed skill.

## Use a Skill

Skills activate through agent instructions. Some skills are automatic for matching tasks. Others can be requested explicitly in chat by name.

Example:

```text
Use the PDF skill to inspect this generated report and verify the layout.
```

Skills should be treated as trusted code/instructions. Install only from sources you trust.
