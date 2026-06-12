# Providers

This document describes the supported providers and models in the application.

## Supported Providers

### API Key Providers

The following providers support API key authentication. Configure them in the Settings → Configure Provider → API Keys tab.

| Provider ID | Provider Name | API Key Environment Variable | Placeholder |
|-------------|---------------|------------------------------|-------------|
| `anthropic` | Anthropic | `ANTHROPIC_API_KEY` | `sk-ant-...` |
| `openai` | OpenAI | `OPENAI_API_KEY` | `sk-...` |
| `deepseek` | DeepSeek | `DEEPSEEK_API_KEY` | `sk-...` |
| `google` | Google Gemini | `GEMINI_API_KEY` | `AIza...` |
| `google-vertex` | Google Vertex AI | - | `...` |
| `amazon-bedrock` | Amazon Bedrock | - | `...` |
| `mistral` | Mistral | `MISTRAL_API_KEY` | `...` |
| `groq` | Groq | `GROQ_API_KEY` | `gsk_...` |
| `cerebras` | Cerebras | `CEREBRAS_API_KEY` | `...` |
| `xai` | xAI | `XAI_API_KEY` | `xai-...` |
| `openrouter` | OpenRouter | `OPENROUTER_API_KEY` | `sk-or-...` |
| `vercel-ai-gateway` | Vercel AI Gateway | `AI_GATEWAY_API_KEY` | `...` |
| `huggingface` | Hugging Face | `HF_TOKEN` | `hf_...` |
| `fireworks` | Fireworks | `FIREWORKS_API_KEY` | `fw_...` |
| `kimi-coding` | Kimi For Coding | `KIMI_API_KEY` | `...` |
| `minimax` | MiniMax | `MINIMAX_API_KEY` | `...` |
| `minimax-cn` | MiniMax (China) | `MINIMAX_CN_API_KEY` | `...` |
| `zai` | ZAI | `ZAI_API_KEY` | `...` |
| `opencode` | OpenCode Zen | `OPENCODE_API_KEY` | `...` |
| `opencode-go` | OpenCode Go | `OPENCODE_API_KEY` | `...` |
| `azure-openai-responses` | Azure OpenAI | `AZURE_OPENAI_API_KEY` | `...` |

### OAuth Providers

The following providers support OAuth authentication. Configure them in the Settings → Configure Provider → Subscriptions tab.

- **Anthropic** (Claude Pro/Max)
- **ChatGPT** (Plus/Pro, Codex)
- **GitHub Copilot**
- **Google** (Gemini CLI, Antigravity)

## DeepSeek Provider

DeepSeek provides V4 Flash and Pro models with competitive pricing and strong reasoning capabilities.

### Authentication

DeepSeek uses the `DEEPSEEK_API_KEY` environment variable or the `deepseek` key in the auth file (`~/.pi/agent/auth.json`):

```json
{
  "deepseek": { "type": "api_key", "key": "sk-..." }
}
```

### Available Models

DeepSeek V4 series includes:
- `deepseek-chat` - General purpose chat model
- `deepseek-reasoner` - Advanced reasoning model
- Plus various specialized variants

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DEEPSEEK_API_KEY` | Your DeepSeek API key |

## API Keys

### Auth File

API keys are stored in `~/.pi/agent/auth.json` with `0600` permissions (user read/write only).

```json
{
  "provider-id": { "type": "api_key", "key": "your-key-here" }
}
```

### Key Resolution Order

1. CLI `--api-key` flag (not exposed in this UI)
2. `auth.json` entry (API key or OAuth token)
3. Environment variable

### Key Formats

The `key` field supports three formats:

- **Literal value:** Used directly
  ```json
  { "type": "api_key", "key": "sk-ant-..." }
  ```
- **Environment variable:** Uses the value of the named variable
  ```json
  { "type": "api_key", "key": "MY_ANTHROPIC_KEY" }
  ```
- **Shell command:** Executes and uses stdout (cached for process lifetime)
  ```json
  { "type": "api_key", "key": "!security find-generic-password -ws 'anthropic'" }
  ```

## Local Model Providers

In addition to cloud providers, you can register local inference providers (e.g., an OpenAI-compatible server running on your machine):

1. Go to **Settings** → **Providers** → **Local Models**
2. Add a provider with its base URL and available models
3. Local models appear in the model selector alongside cloud models

Local providers are managed via the `/local-providers` API (see the [API Reference](api.md#local-models)). For slow local inference, consider raising `retry.provider.timeoutMs` — see [Settings](settings.md).

## Model Selection

Models are available based on your configured providers and API keys. The model selector in the chat interface shows only models compatible with your authentication setup.