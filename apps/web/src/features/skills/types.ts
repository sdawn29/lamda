export interface SkillSearchResult {
  /** "owner/repo/skillId" — pass straight back as the install source. */
  id: string
  name: string
  /** "owner/repo" */
  source: string
  installs?: number
}

export interface InstalledSkill {
  /** Directory name under ~/.lamda/skills. */
  name: string
  description: string
  updatedAt: number
  /** Registry id ("owner/repo/skillId") it was installed from, when known. */
  source?: string
}

export interface SkillDetailFile {
  path: string
  size: number
}

export interface SkillDetails {
  /** Registry id ("owner/repo/skillId") this was fetched for. */
  source: string
  name: string
  description: string
  /** SKILL.md body (markdown, frontmatter stripped). */
  body: string
  files: SkillDetailFile[]
}

export type SkillInstallStatus = "running" | "success" | "error"

export interface SkillInstallJob {
  id: string
  source: string
  status: SkillInstallStatus
  skill?: InstalledSkill
  error?: string
  startedAt: number
  finishedAt?: number
}
