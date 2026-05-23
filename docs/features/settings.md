# Settings Guide

The Settings panel controls how lamda behaves — from AI provider configuration to appearance preferences.

## Accessing Settings

### Method 1: Settings Button

Click the **gear icon** in the sidebar footer.

### Method 2: Keyboard Shortcut

Press `Cmd/Ctrl + ,` to open settings.

## Settings Categories

### General

| Setting | Description | Default |
|---------|-------------|---------|
| **Theme** | Application appearance | Dark |
| **Font Size** | UI text size | System default |
| **Thinking Visibility** | Show/hide thinking blocks | Show |

### Terminal

| Setting | Description | Default |
|---------|-------------|---------|
| **Theme** | Terminal appearance | Dark |
| **Shell** | Default shell path | System default |

### Advanced

| Setting | Description | Default |
|---------|-------------|---------|
| **Retry Enabled** | Auto-retry on transient errors | Enabled |
| **Max Retries** | Maximum retry attempts | 3 |
| **Base Delay (ms)** | Initial retry delay | 2000 |

## AI Providers

### Supported Providers

| Provider | API Key Variable | Status |
|----------|-----------------|--------|
| Anthropic | `ANTHROPIC_API_KEY` | ✅ Popular |
| OpenAI | `OPENAI_API_KEY` | ✅ Popular |
| Google Gemini | `GEMINI_API_KEY` | ✅ Popular |
| DeepSeek | `DEEPSEEK_API_KEY` | ✅ Popular |
| OpenRouter | `OPENROUTER_API_KEY` | ✅ Popular |
| Groq | `GROQ_API_KEY` | ✅ Popular |
| Mistral | `MISTRAL_API_KEY` | ✅ Popular |
| Ollama | (local) | ✅ Local |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` | ✅ Enterprise |
| Amazon Bedrock | - | ✅ Enterprise |

### Adding a Provider

1. Go to **Settings** → **Providers**
2. Click **Add Provider**
3. Select the provider from the dropdown
4. Enter your API key
5. Click **Save**

### Provider Card

Each configured provider shows:
- **Status indicator** (green = connected)
- **Model selector** — Choose which model to use
- **API key** — Masked for security
- **Remove button** — Delete this provider

### Provider Status States

| State | Meaning |
|-------|---------|
| ✅ Configured | API key present, ready to use |
| ⚠️ Invalid Key | API key format is incorrect |
| ❌ Quota Exceeded | API limit reached |
| ⏳ Checking | Verifying credentials... |

## API Keys

### Where Keys are Stored

API keys are stored in: `~/.pi/agent/auth.json`

With file permissions `0600` (user read/write only).

### Key Format

```json
{
  "anthropic": {
    "type": "api_key",
    "key": "sk-ant-..."
  },
  "openai": {
    "type": "api_key", 
    "key": "sk-..."
  }
}
```

### Key Resolution Order

1. CLI `--api-key` flag (not exposed in UI)
2. `auth.json` entry
3. Environment variable

### Environment Variable Keys

Use environment variables for keys:

```json
{
  "anthropic": {
    "type": "api_key",
    "key": "ANTHROPIC_API_KEY"
  }
}
```

The system will use the value of the `ANTHROPIC_API_KEY` environment variable.

### Shell Command Keys

Execute a command to retrieve the key:

```json
{
  "anthropic": {
    "type": "api_key",
    "key": "!security find-generic-password -ws 'anthropic'"
  }
}
```

The `!` prefix executes the command and uses its stdout.

## Model Selection

### Choosing a Model

1. In the chat input area, click the **Model** dropdown
2. Select from available models

Models are grouped by provider:
```
Anthropic
├── Claude 3.5 Sonnet
├── Claude 3 Opus
└── Claude 3 Haiku

OpenAI
├── GPT-4 Turbo
├── GPT-4
└── GPT-3.5 Turbo

DeepSeek
├── DeepSeek V4
└── DeepSeek Reasoner
```

### Model Compatibility

Only models compatible with your configured providers appear in the selector.

### Setting Default Model

1. Go to **Settings** → **General**
2. Find **Default Model**
3. Select your preferred model
4. New threads will use this model

## Thinking Settings

### Thinking Levels

Control how deeply the agent thinks:

| Level | Description | Token Budget |
|-------|-------------|--------------|
| Off | No extended thinking | 0 |
| Minimal | Quick thoughts | ~100 |
| Low | Light reasoning | ~500 |
| Medium | Balanced (default) | ~2000 |
| High | Deep reasoning | ~8000 |
| X-High | Maximum reasoning | ~32000 |

### Toggling Thinking Visibility

Choose whether thinking blocks appear in chat:

1. **Settings** → **General**
2. Find **Thinking Visibility**
3. Choose **Show** or **Hide**

### Custom Thinking Budgets

For advanced users, configure custom token budgets:

```json
{
  "thinkingBudgets": {
    "high": 16000,
    "xhigh": 64000
  }
}
```

Edit in `~/.pi/agent/settings.json` directly.

## Retry Configuration

### When Retries Happen

Retries occur on transient errors:
- Network timeouts
- Rate limiting (429 responses)
- Server errors (5xx responses)
- Temporary API unavailability

### Retry Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| **Retry Enabled** | boolean | true | Enable auto-retry |
| **Max Retries** | number | 3 | Maximum attempts |
| **Base Delay (ms)** | number | 2000 | Initial delay (2s, 4s, 8s...) |

### Provider Timeout

Control how long requests wait:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| **Provider Timeout** | number | SDK default | Per-request timeout |
| **Max Retry Delay** | number | 60000 | Max server-requested delay |

### Example: Long-Running Local Inference

```json
{
  "retry": {
    "enabled": true,
    "maxRetries": 3,
    "baseDelayMs": 2000,
    "provider": {
      "timeoutMs": 3600000,
      "maxRetries": 0
    }
  }
}
```

This sets a 1-hour timeout for slow local models.

## Project Settings

### Override Global Settings

Project settings in `.pi/settings.json` override global settings:

```json
// ~/.pi/agent/settings.json (global)
{
  "theme": "dark",
  "defaultModel": "claude-3-5-sonnet"
}

// .pi/settings.json (project)
{
  "defaultModel": "deepseek-chat",
  "retry": {
    "baseDelayMs": 4000
  }
}

// Result: theme=dark, model=deepseek, retry.baseDelayMs=4000
```

### Creating Project Settings

1. In your project folder, create `.pi/settings.json`
2. Add your overrides
3. Settings apply when this folder is the workspace

## Appearance

### Themes

| Theme | Description |
|-------|-------------|
| **Dark** | Dark background (default) |
| **Light** | Light background |
| **System** | Follow system preference |

### Font Size

Adjust UI text size:
- **Small** — Compact UI
- **Medium** — Default
- **Large** — Larger text
- **Extra Large** — Accessibility

## Data Management

### Reset All Data

⚠️ **Destructive Action** — Deletes all workspaces, threads, and settings:

```markdown
1. Open Settings
2. Go to **Advanced**
3. Click **Reset All Data**
4. Confirm in dialog
5. Application restarts fresh
```

### Export Settings

Export your settings for backup or migration.

### Import Settings

Import previously exported settings.

## Related

- [Providers](providers.md) — Detailed provider documentation
- [Chat Interface](chat.md) — Model and thinking in chat
- [API Reference](../api.md) — Settings API endpoints