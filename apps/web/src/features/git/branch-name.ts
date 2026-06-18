/** Derives a branch name `lamda/<slug>` from a chat/thread title (lowercased, dashed). */
export function branchNameFromTitle(title: string | null | undefined): string {
  const slug = (title ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 40)
    .replace(/-+$/, "")
  return `lamda/${slug || "worktree"}`
}
