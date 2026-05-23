# Quick Start Guide

Get up and running with lamda in 5 minutes.

## Prerequisites

- **Node.js** 18+ 
- **npm** 11+
- **Git** (for workspace git features)
- **macOS on Apple Silicon** (for packaged desktop builds)

## Step 1: Install

```bash
git clone <repository-url>
cd lamda
npm install
```

## Step 2: Start the Application

```bash
npm run dev
```

This starts all three components:

| Component | URL | Description |
|-----------|-----|-------------|
| Web UI | http://localhost:5173 | The user interface |
| Server | http://localhost:3001 | API backend |
| Desktop | (Electron window) | Desktop shell |

## Step 3: Configure Your AI Provider

Before chatting, configure an AI provider:

1. Click the **Settings** gear icon in the sidebar
2. Go to **Providers** → **Add Provider**
3. Select your preferred provider:
   - **Anthropic** (recommended for best results)
   - **OpenAI**
   - **DeepSeek**
   - **Google Gemini**
4. Enter your API key
5. Click **Save**

## Step 4: Create Your First Workspace

1. Click **+ New Workspace** in the sidebar
2. Choose **Local Folder**
3. Click **Browse** and select a project folder
4. Click **Create Workspace**

Or clone a repository:

1. Click **+ New Workspace**
2. Choose **Clone Repository**
3. Enter a git URL (e.g., `https://github.com/user/repo.git`)
4. Click **Clone and Create**

## Step 5: Start Chatting

A new thread is automatically created. Type your first message:

```
Hi! Can you help me understand this codebase?
```

The agent will respond with streaming text and may use tools to explore your code.

---

## Your First Conversation

### Asking Questions

```
You: "What does this function do?"

Agent: "This function handles user authentication.
       It validates credentials against the database
       and creates a session token..."
```

### Making Changes

```
You: "Can you add input validation to the login form?"

Agent: "I'll add validation to ensure:
       - Email is properly formatted
       - Password meets minimum requirements
       - No empty fields are submitted..."
```

### Debugging Issues

```
You: "The login button isn't working. Can you help?"

Agent: "Let me investigate... I can see the issue.
       The form submit handler isn't being called
       because the onClick is on the wrong element..."
```

---

## Essential Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Enter` | Send message |
| `Cmd/Ctrl + K` | Command palette |
| `Cmd/Ctrl + ,` | Open settings |
| `Shift + Enter` | New line in input |
| `Escape` | Cancel current operation |

---

## Common Tasks

### View Git Changes

1. Click the **Git** toggle in the title bar
2. See unstaged, staged, and untracked files
3. Click a file to see the diff

### Stage and Commit

1. In Git panel, click **Stage All**
2. Click **Commit**
3. Write a commit message
4. Click **Create Commit**

### Open Terminal

1. Click the **Terminal** toggle in the title bar
2. A terminal opens in the bottom panel
3. Type commands as usual

### Switch Branches

1. Open the Git panel
2. Click the **Branch** dropdown
3. Select a branch

---

## Next Steps

### Learn More

- [Chat Interface](features/chat.md) — Master the chat interface
- [Git Integration](features/git.md) — Full git workflow
- [Terminal](features/terminal.md) — Embedded shell
- [Workspaces](features/workspaces.md) — Organize projects

### Configure

- [Settings](features/settings.md) — Customize preferences
- [Providers](providers.md) — More provider options
- [MCP](features/mcp.md) — Extend with MCP servers

### Reference

- [API Reference](api.md) — API endpoints
- [CLI Reference](cli.md) — Command-line tools
- [Architecture](architecture.md) — How it works

---

## Troubleshooting

### "Connection failed"

```bash
# Check server is running
curl http://localhost:3001/health

# Should return: {"status":"ok"}
```

### "API key not working"

1. Verify key is correct in Settings
2. Check provider status shows "Connected"
3. Ensure you have API credits/quota

### "Terminal not responding"

1. Ensure server is running
2. Close and reopen terminal panel
3. Check port 3001 is not blocked

### "Git operations failing"

1. Verify Git is installed: `git --version`
2. Check workspace path exists
3. Ensure proper file permissions

---

## Getting Help

- [GitHub Issues](https://github.com/snehasishdawn/lamda/issues) — Report bugs
- [docs/index.md](index.md) — Full documentation