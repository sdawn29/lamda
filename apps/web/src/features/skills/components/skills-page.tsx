import type { ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { Badge } from "@/shared/ui/badge"
import { Skeleton } from "@/shared/ui/skeleton"
import {
  useInstallSkill,
  useInstalledSkills,
  usePopularSkills,
  useRemoveSkill,
  useSkillInstallJobs,
  useSkillSearch,
} from "../queries"
import { useSkillsSearchStore } from "../store"
import type { InstalledSkill, SkillSearchResult } from "../types"
import { InstalledSkillCard } from "./installed-skill-card"
import { SkillCard } from "./skill-card"

export function SkillsPage() {
  const navigate = useNavigate()
  const query = useSkillsSearchStore((s) => s.query)
  const isSearching = query.trim().length >= 2

  const { data: searchResults, isFetching: searching } = useSkillSearch(query)
  const { data: popular, isLoading: loadingPopular } = usePopularSkills()
  const { data: installed = [] } = useInstalledSkills()
  const { data: jobs = [] } = useSkillInstallJobs()
  const install = useInstallSkill()
  const remove = useRemoveSkill()

  const installedNames = new Set(installed.map((s) => s.name.toLowerCase()))
  const runningJobFor = (id: string) =>
    jobs.find((j) => j.source === id && j.status === "running")

  const handleInstall = (result: SkillSearchResult) => {
    install.mutate(result.id, {
      onError: (err) =>
        toast.error("Could not start install", {
          description: err instanceof Error ? err.message : String(err),
        }),
      onSuccess: () => toast.message(`Installing "${result.name}"`),
    })
  }

  const handleRemove = (skill: InstalledSkill) => {
    remove.mutate(skill.name, {
      onError: (err) =>
        toast.error("Could not remove skill", {
          description: err instanceof Error ? err.message : String(err),
        }),
    })
  }

  const openDetails = (source: string) => {
    if (!source) return
    navigate({ to: "/skills/$id", params: { id: encodeURIComponent(source) } })
  }

  const shownResults = isSearching ? (searchResults ?? []) : (popular ?? [])
  const sectionLoading = isSearching ? searching : loadingPopular

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-8 px-5 py-4">
        <p className="text-3xs text-muted-foreground/60">
          Skills installed here are saved globally to{" "}
          <code>~/.lamda/skills</code> and available to every workspace.
        </p>

        <section className="flex flex-col gap-2.5">
          <SectionHeading
            title={
              isSearching ? `Results for "${query.trim()}"` : "Popular skills"
            }
          />
          <SkillGrid
            loading={sectionLoading}
            empty={shownResults.length === 0}
            emptyLabel={
              isSearching
                ? `No skills found for "${query.trim()}".`
                : "Couldn't load popular skills right now."
            }
          >
            {shownResults.map((result) => (
              <SkillCard
                key={result.id}
                name={result.name}
                subtitle={result.source}
                installs={result.installs}
                installed={installedNames.has(result.name.toLowerCase())}
                installing={
                  install.isPending ||
                  runningJobFor(result.id)?.status === "running"
                }
                onInstall={() => handleInstall(result)}
                onClick={() => openDetails(result.id)}
              />
            ))}
          </SkillGrid>
        </section>

        <section className="flex flex-col gap-2.5">
          <SectionHeading title="Installed" count={installed.length} />
          {installed.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/60 px-4 py-8 text-center text-xs text-muted-foreground">
              No skills installed yet. Pick one above to get started.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {installed.map((skill) => (
                <InstalledSkillCard
                  key={skill.name}
                  skill={skill}
                  removing={remove.isPending && remove.variables === skill.name}
                  onRemove={() => handleRemove(skill)}
                  onClick={
                    skill.source ? () => openDetails(skill.source!) : undefined
                  }
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function SectionHeading({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="text-sm font-medium tracking-tight">{title}</h2>
      {count !== undefined && (
        <Badge variant="secondary" className="tabular-nums">
          {count}
        </Badge>
      )}
    </div>
  )
}

function SkillGrid({
  loading,
  empty,
  emptyLabel,
  children,
}: {
  loading: boolean
  empty: boolean
  emptyLabel: string
  children: ReactNode
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-2.5 rounded-lg bg-card px-3 py-2.5 ring-1 ring-foreground/10"
          >
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-9 rounded-md" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-2.5 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-5 w-16 self-end rounded-full" />
          </div>
        ))}
      </div>
    )
  }

  if (empty) {
    return (
      <p className="rounded-lg border border-dashed border-border/60 px-4 py-8 text-center text-xs text-muted-foreground">
        {emptyLabel}
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  )
}
