# Chat

The chat view is the main interface for working with the Pi coding agent. It supports streaming responses, thread modes, model selection, file context, image attachments, slash commands, tool approvals, questions, todos, plan cards, file-change cards, and context compaction.

> Screenshot needed: capture `/workspace/<threadId>` with a chat thread open, a recent assistant message visible, the composer visible, and at least one tool call expanded.

## Send a Message

1. Open a workspace thread.
2. Choose a mode from the composer.
3. Choose a model and thinking level if you want to override the thread defaults.
4. Type your prompt.
5. Press `Cmd/Ctrl + Enter` or use the send button.

Use `Shift + Enter` for a new line inside the composer.

## Choose a Thread Mode

| Mode    | Use it when                                                                              |
| ------- | ---------------------------------------------------------------------------------------- |
| `Agent` | You want the agent to inspect files, edit code, run commands, and carry the task through |
| `Ask`   | You want explanations, code reading, design feedback, or review without file edits       |
| `Plan`  | You want a proposed implementation plan before changes begin                             |

The selected mode is stored per thread and can be changed between turns.

## Add Context

Use these context sources when a prompt needs more precision:

| Context source  | How to use it                                                                  |
| --------------- | ------------------------------------------------------------------------------ |
| File mentions   | Type `@` in the composer and choose a workspace file                           |
| Slash commands  | Type `/` to reveal available command shortcuts                                 |
| Images          | Attach screenshots or visual references when the composer supports image input |
| Open file tabs  | Keep relevant source files open while asking questions                         |
| Terminal output | Paste important output or ask the agent to run a command in `Agent` mode       |

> Screenshot needed: capture the composer with the `@` file mention dropdown open on `/workspace/<threadId>`.

## Read Agent Output

| Element           | Meaning                                                               |
| ----------------- | --------------------------------------------------------------------- |
| Assistant message | The agent's natural language response                                 |
| Tool call         | A command, file operation, search, or other capability the agent used |
| Thinking block    | Optional reasoning text, controlled by chat settings                  |
| Todo panel        | Progress checklist for multi-step work                                |
| Question card     | A choice or clarification the agent needs from you                    |
| Approval block    | A tool action that needs explicit approval before continuing          |
| File changes card | Summary of files changed during a turn                                |
| Plan card         | Saved or proposed implementation plan                                 |
| Error alert       | Recoverable or terminal error with retry or dismiss actions           |

> Screenshot needed: capture a question card in the chat stream on `/workspace/<threadId>`.

## Approve or Reject Tool Calls

Some commands require permission before they run.

1. Read the approval block in the chat.
2. Check the command, affected path, or external action.
3. Approve it to continue, or reject it and provide a safer instruction.

Use approvals for commands that install dependencies, access the network, write outside the workspace, open GUI apps, or could discard data.

## Steer a Running Turn

When the agent is mid-task, you can add guidance without starting a new independent task.

1. Type a correction or extra constraint while the turn is running.
2. Send it as a steering message if available.
3. The agent applies it after the current safe stopping point.

Use follow-up messages for work that should happen after the current turn finishes.

## Fork a Thread

Forking lets you branch from an earlier point without losing the original path.

1. Hover over a user message.
2. Choose `Fork`.
3. lamda creates a new thread with history copied up to that message.
4. The git working tree is restored to the checkpoint for that moment when available.
5. Continue from the new thread.

> Screenshot needed: capture a user message hover state with the fork action visible on `/workspace/<threadId>`.

## Compact Long Context

As conversations grow, context usage increases.

1. Open the context or usage indicator in the chat.
2. Review token usage and model cost if shown.
3. Use compact when the conversation is long but the key state should be preserved.
4. Continue in the same thread after compaction.

> Screenshot needed: capture the context usage indicator or context chart inside a busy thread.

## Recover from Errors

1. Read the error alert in the chat.
2. Use `Retry` when the issue is transient, such as provider rate limits or network failures.
3. Use `Dismiss` when you want to keep the current thread but clear the alert.
4. Adjust provider keys, retry settings, or model choice if the same error repeats.

Related settings: `Settings -> Chat`, `Settings -> Retry`, and `Settings -> API Keys`.
