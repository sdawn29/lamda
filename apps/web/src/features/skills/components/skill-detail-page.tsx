import { useNavigate } from "@tanstack/react-router"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  AlertCircle,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { chatProseClassRich } from "@/features/chat/components/markdown-components"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Skeleton } from "@/shared/ui/skeleton"
import {
  useInstallSkill,
  useInstalledSkills,
  useRemoveSkill,
  useSkillDetails,
  useSkillInstallJobs,
} from "../queries"
import { SkillAvatar } from "./skill-avatar"

export function SkillDetailPage({ source }: { source: string }) {
  const navigate = useNavigate()
  const { data: details, isLoading, isError } = useSkillDetails(source)
  const { data: installed = [] } = useInstalledSkills()
  const { data: jobs = [] } = useSkillInstallJobs()
  const install = useInstallSkill()
  const remove = useRemoveSkill()

  const installedSkill = installed.find((s) => s.source === source)
  const runningJob = jobs.find((j) => j.source === source && j.status === "running")
  const installing = install.isPending || runningJob?.status === "running"

  const [owner, repo] = source.split("/")
  const registryUrl = owner && repo ? `https://skills.sh/${owner}/${repo}` : null

  const handleInstall = () => {
    install.mutate(source, {
      onError: (err) =>
        toast.error("Could not start install", {
          description: err instanceof Error ? err.message : String(err),
        }),
      onSuccess: () => toast.message(`Installing "${details?.name ?? source}"`),
    })
  }

  const handleRemove = () => {
    if (!installedSkill) return
    remove.mutate(installedSkill.name, {
      onError: (err) =>
        toast.error("Could not remove skill", {
          description: err instanceof Error ? err.message : String(err),
        }),
      onSuccess: () => navigate({ to: "/skills" }),
    })
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-5">
          {isLoading && <DetailSkeleton />}

          {isError && !isLoading && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>
                Couldn't load this skill. It may have been removed from the registry.
              </AlertDescription>
            </Alert>
          )}

          {details && (
            <>
              <div className="flex items-start gap-3">
                <SkillAvatar name={details.name} className="size-9" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-xs font-medium text-foreground">
                    {source}
                  </span>
                  {registryUrl && (
                    <a
                      href={registryUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-3xs text-primary hover:underline"
                    >
                      View on skills.sh
                      <ExternalLink className="size-2.5" />
                    </a>
                  )}
                </div>

                <div className="shrink-0">
                  {installedSkill ? (
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      >
                        Installed
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-destructive"
                        disabled={remove.isPending}
                        onClick={handleRemove}
                      >
                        {remove.isPending ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Trash2 className="size-3" />
                        )}
                        Uninstall
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 px-2.5 text-xs"
                      disabled={installing}
                      onClick={handleInstall}
                    >
                      {installing ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Download className="size-3" />
                      )}
                      Install
                    </Button>
                  )}
                </div>
              </div>

              {details.description && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {details.description}
                </p>
              )}

              {details.body && (
                <div className={chatProseClassRich}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {details.body}
                  </ReactMarkdown>
                </div>
              )}

              {details.files.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h2 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <FileText className="size-3.5" />
                    Files ({details.files.length})
                  </h2>
                  <div className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60">
                    {details.files.map((file) => (
                      <div
                        key={file.path}
                        className="flex items-center justify-between px-3 py-1.5 font-mono text-3xs text-muted-foreground"
                      >
                        <span className="truncate">{file.path}</span>
                        <span className="shrink-0 pl-3 text-muted-foreground/50">
                          {formatBytes(file.size)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <Skeleton className="size-9 rounded-md" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-2.5 w-1/4" />
        </div>
        <Skeleton className="h-7 w-20 rounded-md" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
