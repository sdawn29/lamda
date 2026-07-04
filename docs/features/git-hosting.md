# Git Hosting

lamda includes GitHub and GitLab integrations for repository review workflows. When connected, hosting-specific views appear in the source-control panel.

> Screenshot needed: capture `/settings/git` with GitHub and GitLab connection controls visible.

## Connect an Account

1. Open `Settings -> Git`.
2. Connect GitHub or GitLab.
3. Complete the authentication flow.
4. Return to a workspace with a matching remote.
5. Open the source-control panel and choose the `GitHub` or `GitLab` view.

## Review Pull Requests or Merge Requests

1. Open a workspace thread.
2. Open the source-control panel.
3. Select `GitHub` or `GitLab`.
4. Review repository, branch, PR/MR, checks, and comments when available.
5. Ask the agent to address comments or summarize CI failures.

> Screenshot needed: capture the `GitHub` source-control view on `/workspace/<threadId>` with a connected repository.

## Create a Pull Request

1. Commit local changes.
2. Push the branch.
3. Open the GitHub view.
4. Start the create PR flow.
5. Review title, body, base branch, and draft state.
6. Create the PR.

> Screenshot needed: capture the create PR dialog.

## Create a Merge Request

1. Commit and push the branch.
2. Open the GitLab view.
3. Start the create MR flow.
4. Review title, description, target branch, and draft state.
5. Create the MR.

> Screenshot needed: capture the create MR dialog.

## CI Checks

Connected GitHub repositories can show CI check status in the review UI.

1. Open the GitHub view.
2. Inspect the checks badge.
3. Ask the agent to investigate failing checks if logs are available through the integration or terminal.

## Troubleshooting

| Problem                 | Try                                                                  |
| ----------------------- | -------------------------------------------------------------------- |
| Hosting view is missing | Confirm account connection and repository remote URL                 |
| PR/MR creation fails    | Confirm branch is pushed and credentials have repository permissions |
| CI status is absent     | Confirm the provider exposes checks for the branch or PR             |
