import { createAgentSessionServices, getAgentDir } from "@earendil-works/pi-coding-agent"
import { lamdaPromptTemplatePaths, lamdaSkillPaths } from "./lamda-paths.js"
import type { SlashCommand } from "./types.js"

// Duck-typed shape for the parts of the SDK resource loader we read. Avoids a
// direct dependency on the loader's exported types.
type ResourceLoaderLike = {
  getSkills(): { skills: Array<{ name: string; description?: string }> }
  getPrompts(): { prompts: Array<{ name: string; description?: string }> }
}

/**
 * Map a resource loader's skills + prompts into the flat slash-command list the
 * UI consumes. Skills carry a `skill:` prefix so the client can distinguish
 * them from prompt templates.
 */
export function mapResourceCommands(resourceLoader: ResourceLoaderLike): SlashCommand[] {
  const { skills } = resourceLoader.getSkills()
  const { prompts } = resourceLoader.getPrompts()
  return [
    ...skills.map((s) => ({
      name: `skill:${s.name}`,
      description: s.description,
      source: "skill" as const,
    })),
    ...prompts.map((p) => ({
      name: p.name,
      description: p.description,
      source: "prompt" as const,
    })),
  ]
}

/**
 * List the slash commands (skills + prompt templates) available for a workspace
 * directory without an active agent session. Builds the cwd-bound resource
 * loader on its own — no model, tools, or session are created — so the new-thread
 * composer can preview skills before the first thread (and its session) exists.
 */
export async function getWorkspaceCommands(cwd: string): Promise<SlashCommand[]> {
  const services = await createAgentSessionServices({
    cwd,
    agentDir: getAgentDir(),
    resourceLoaderOptions: {
      additionalPromptTemplatePaths: lamdaPromptTemplatePaths(cwd),
      additionalSkillPaths: lamdaSkillPaths(cwd),
    },
  })
  return mapResourceCommands(services.resourceLoader as ResourceLoaderLike)
}
