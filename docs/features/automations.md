# Automations

Automations run saved prompts on a schedule while the app is running. Each automation belongs to a workspace and can create or update a thread with the run result.

> Screenshot needed: capture `/automations` with at least one enabled automation, one disabled automation, and the run-history action visible.

## Open Automations

1. Open the automations route from app navigation or the command palette if available.
2. Review the list of automations.
3. Each row shows enabled state, schedule, workspace, prompt preview, and last run status.

Automations fire only while lamda is running.

## Create an Automation

1. Open `/automations`.
2. Click `New Automation`.
3. Select the workspace.
4. Enter a name.
5. Enter the prompt the agent should run.
6. Set the schedule.
7. Save.

> Screenshot needed: capture the automation form dialog with workspace, prompt, and schedule fields visible.

## Run Manually

1. Open `/automations`.
2. Click the run action for an automation.
3. Watch for the running status.
4. Open the generated or updated thread when the run completes.

Manual runs are useful for testing a prompt before relying on the schedule.

## Enable or Disable

1. Open the automation row.
2. Toggle enabled state.
3. Disabled automations remain saved but do not run on schedule.

## View Run History

1. Open the row menu.
2. Choose history.
3. Inspect success, failure, timing, and linked thread details.

> Screenshot needed: capture the automation run history dialog.

## Delete an Automation

1. Open the row menu.
2. Choose delete.
3. Confirm.

Deleting an automation removes its run history. Threads created by previous runs are kept.
