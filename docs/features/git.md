# Git

The Git panel gives each workspace a built-in source-control workflow: turn-by-turn diffs, full working tree diffs, branch controls, staging, commits, stashes, history, push, and revert operations.

> Screenshot needed: capture `/workspace/<threadId>` with the right source-control panel open on `Turns`, a changed file selected, and the diff visible.

## Open Source Control

1. Open a workspace thread.
2. Click the source-control or review-panel button in the title bar, or open it from the command palette.
3. Use the panel view selector to choose `Turns`, `All Changes`, `History`, `GitHub`, or `GitLab`.

## Choose a Review View

| View          | Purpose                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------ |
| `Turns`       | Shows files changed by recent agent turns and helps review exactly what the agent just did |
| `All Changes` | Shows the full git working tree, including user edits and agent edits                      |
| `History`     | Shows commit history for the workspace                                                     |
| `GitHub`      | Shows pull request and GitHub review context when connected                                |
| `GitLab`      | Shows merge request context when connected                                                 |

## Review Diffs

1. Select a file in the source-control list.
2. Choose inline or side-by-side diff mode when available.
3. Use sorting controls to group by name or status.
4. Inspect insertions, deletions, renamed files, untracked files, and binary-file indicators.
5. Use fullscreen diff mode for large reviews.

> Screenshot needed: capture fullscreen diff mode on `/workspace/<threadId>`.

## Stage Changes

1. Switch to `All Changes`.
2. Expand a file to inspect its diff.
3. Stage an individual file, unstage it, or use `Stage All`.
4. For partial commits, stage only the files that belong together.

Status labels follow git conventions such as `M` for modified, `A` for added, `D` for deleted, and `??` for untracked.

## Commit Changes

1. Stage the changes you want.
2. Open the commit dialog.
3. Enter a conventional commit type, optional scope, subject, body, and footer.
4. Use AI-generated commit messages when the staged diff is clear enough.
5. Create the commit.

> Screenshot needed: capture the commit dialog opened from the source-control panel with staged files present.

## Branches

1. Open the branch selector in the Git panel.
2. Choose an existing branch to check it out.
3. Create a new branch when starting isolated work.
4. Confirm the active branch in the panel header before committing.

For agent work, prefer starting a task on the branch where you want the final commit to land.

## Stashes

1. Open the stash section from `All Changes`.
2. Enter a message and stash current changes.
3. Use `Apply` to restore a stash while keeping it.
4. Use `Pop` to restore and remove it.
5. Use `Drop` only when you are sure the stash is no longer needed.

## Push

1. Commit local changes.
2. Use the Git panel push action when available.
3. Resolve authentication or remote errors in your terminal or hosting-provider setup.

## Revert a File

1. Select a changed file.
2. Use the file revert action.
3. Confirm the destructive action.

Reverting a file discards local changes for that file. Use it only after checking the diff.

## Initialize Git

If a workspace is not a git repository, the panel can offer `Initialize Git Repository`.

1. Open the Git panel in the workspace.
2. Choose `Initialize Git Repository`.
3. Make an initial commit from the panel or terminal.
