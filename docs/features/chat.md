# Chat Interface Guide

The chat interface is the primary way to interact with the Pi coding agent. It provides real-time streaming responses, tool execution visualization, and rich message formatting.

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Chat Interface                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 🤖 Assistant                                              │ │
│  │    I'll analyze the codebase and help fix the bug...     │ │
│  │                                                           │ │
│  │ 🔧 Tool: read_file                                        │ │
│  │    Args: { path: "src/auth.ts" }                          │ │
│  │    Result: ┌─────────────────────────────────────────────┐│ │
│  │           │ const login = async (req, res) => {         ││ │
│  │           │   await authService.login(req.body);         ││ │
│  │           │   res.redirect('/dashboard');                 ││ │
│  │           └─────────────────────────────────────────────┘│ │
│  │                                                           │ │
│  │ 💭 Thinking                                               │ │
│  │    The issue appears to be a timing problem where...      │ │
│  │                                                           │ │
│  │ 👤 You                                                    │ │
│  │    Can you fix the login redirect issue?                  │ │
│  └───────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Type your message...                        [Model ▾][⏱] │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Sending Messages

### Basic Usage

1. Type your message in the input field at the bottom
2. Press **Enter** or click **Send** to submit
3. Watch the agent stream its response in real-time

### Multi-line Input

The chat input supports multi-line messages:
- Press **Shift+Enter** to add a new line
- Press **Enter** to send the message

### Message Formatting

Messages support Markdown formatting:
- **Bold**, *italic*, `code`
- Code blocks with syntax highlighting
- Lists and headings
- Links and images

## Tool Execution

When the agent uses tools, you'll see:

### Tool Call Block

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔧 read_file                                                   │
│                                                                 │
│ Args:                                                          │
│ {                                                              │
│   "path": "src/components/Button.tsx"                          │
│ }                                                              │
│                                                                 │
│ ─────────────────────────────────────────────────────────────── │
│ Result:                                                        │
│ ┌─────────────────────────────────────────────────────────────┐│
│ │ import React from 'react';                                  ││
│ │ interface ButtonProps {                                     ││
│ │   variant: 'primary' | 'secondary';                         ││
│ │ }                                                          ││
│ └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│ Duration: 245ms | Status: ✓ Complete                            │
└─────────────────────────────────────────────────────────────────┘
```

### Tool States

| State | Visual | Meaning |
|-------|--------|---------|
| Running | Spinner | Tool is currently executing |
| Complete | ✓ | Tool finished successfully |
| Error | ✗ | Tool encountered an error |

### Collapsible Results

- Tool results are collapsible to reduce clutter
- Click the header to expand/collapse
- "Edit" tools auto-expand to show before/after

## Thinking Blocks

The agent can show its reasoning process:

```
┌─────────────────────────────────────────────────────────────────┐
│ 💭 Thinking                                                    │
│                                                                 │
│ The user is asking about a login issue. Let me analyze...       │
│                                                                 │
│ First, I need to understand the auth flow:                     │
│   1. User submits credentials                                   │
│   2. Server validates                                           │
│   3. Redirect to dashboard                                     │
│                                                                 │
│ The issue might be in the redirect timing...                   │
└─────────────────────────────────────────────────────────────────┘
```

### Toggling Thinking Visibility

Control when thinking blocks are shown:

1. Go to **Settings** → **General**
2. Find **Thinking Visibility**
3. Choose: **Show** (default) or **Hide**

## Thread Modes

Each thread operates in a mode that controls the agent's behaviour. Select the mode in the input bar before sending a message.

| Mode | Description |
|------|-------------|
| **Agent** | Default. Full editing permissions — the agent reads, writes, and edits files. |
| **Ask** | Read-only. The agent answers questions and explores code without making changes. |
| **Plan** | The agent proposes a step-by-step plan and waits for approval before executing. |

The mode is stored per thread and can be changed at any time between turns.

---

## Forking a Thread

Fork lets you branch the conversation at any earlier user message and explore an alternative approach without losing the original history.

1. Hover over any user message
2. Click the **Fork** button that appears
3. A new thread is created with history copied up to that message
4. The git working tree is restored to the state it was in at that point
5. The new thread opens automatically

Forked threads show their source in the sidebar.

---

## Model Selection

Switch between different AI models:

1. Click the **Model** dropdown in the input area
2. Select from available models based on your configured providers
3. The model choice is saved per thread

### Thinking Level

Control how deeply the agent thinks:

| Level | Description |
|-------|-------------|
| Off | No extended thinking |
| Minimal | Quick thoughts only |
| Low | Light reasoning |
| Medium | Balanced thinking |
| High | Deep reasoning |
| X-High | Maximum reasoning |

## Slash Commands

Quick commands for common actions:

| Command | Description |
|---------|-------------|
| `/search <query>` | Search code across the workspace |
| `/file <path>` | Open a specific file |
| `/terminal <command>` | Run a terminal command |

### Using Slash Commands

1. Type `/` in the chat input
2. A dropdown appears with available commands
3. Select or type the command
4. Follow the command-specific prompts

## Context Usage

Monitor your context window consumption:

```
┌─────────────────────────────────────────────────────────────────┐
│ Context Usage                                                   │
│                                                                 │
│ Used: 45,000 tokens                                             │
│ Max:   200,000 tokens                                         │
│ ████████████░░░░░░░░░░░░░░░░░░░░░  22.5%                       │
│                                                                 │
│ Input: 30,000 | Output: 15,000 | Est. Cost: $0.12              │
└─────────────────────────────────────────────────────────────────┘
```

### Compact Context

When context gets high, the agent may auto-compact:

1. System reserves tokens for response (default: 16,384)
2. Older content gets summarized
3. More recent content remains detailed

Manually trigger compaction:
- Click the **Compact** button in the context chart
- Or use the `/compact` slash command

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Enter` | Send message |
| `Shift + Enter` | New line in input |
| `Cmd/Ctrl + K` | Open command palette |
| `Cmd/Ctrl + Shift + S` | Search messages |
| `Escape` | Cancel current operation |

## Error Handling

### Retryable Errors

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️ Error                                                       │
│                                                                 │
│ Rate limit exceeded. Retry in 30 seconds?                       │
│                                                                 │
│ [Retry]  [Dismiss]                                             │
└─────────────────────────────────────────────────────────────────┘
```

Click **Retry** to try the operation again.

### Non-Retryable Errors

For permanent errors (e.g., invalid API key):
1. Fix the underlying issue (check Settings)
2. The message will retry automatically once fixed

## Message Types

| Type | Icon | Description |
|------|------|-------------|
| User | 👤 | Your messages |
| Assistant | 🤖 | Agent responses |
| Tool | 🔧 | Tool execution |
| Thinking | 💭 | Reasoning process |
| Error | ⚠️ | Error messages |

## Related

- [Git Integration](git.md) — How the agent uses git tools
- [Settings](settings.md) — Model and thinking configuration
- [API Reference](../api.md) — Session endpoints
