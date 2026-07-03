# Settings

This document describes the settings available in the application.

## Settings File Locations

Settings are stored in JSON files with project settings overriding global settings:

| Location                    | Scope                       |
| --------------------------- | --------------------------- |
| `~/.pi/agent/settings.json` | Global (all projects)       |
| `.pi/settings.json`         | Project (current directory) |

Edit settings directly in these files, or use the Settings UI in the application.

## All Settings

### Retry Configuration

The `retry` section controls automatic retry behavior for transient errors.

```json
{
  "retry": {
    "enabled": true,
    "maxRetries": 3,
    "baseDelayMs": 2000,
    "provider": {
      "timeoutMs": 3600000,
      "maxRetries": 0,
      "maxRetryDelayMs": 60000
    }
  }
}
```

#### Retry Settings

| Setting             | Type    | Default | Description                                                 |
| ------------------- | ------- | ------- | ----------------------------------------------------------- |
| `retry.enabled`     | boolean | `true`  | Enable automatic agent-level retry on transient errors      |
| `retry.maxRetries`  | number  | `3`     | Maximum agent-level retry attempts                          |
| `retry.baseDelayMs` | number  | `2000`  | Base delay for agent-level exponential backoff (2s, 4s, 8s) |

#### Provider Retry Settings

These settings control the provider/SDK-level request timeout and retry behavior:

| Setting                          | Type   | Default     | Description                                                                                                                                                                                                                                                                      |
| -------------------------------- | ------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `retry.provider.timeoutMs`       | number | SDK default | Provider/SDK request timeout in milliseconds. Useful for long-running local inference.                                                                                                                                                                                           |
| `retry.provider.maxRetries`      | number | SDK default | Provider/SDK retry attempts for failed requests                                                                                                                                                                                                                                  |
| `retry.provider.maxRetryDelayMs` | number | `60000`     | Max server-requested delay before failing (60s). When a provider requests a retry delay longer than this value (e.g., Google's "quota will reset after 5h"), the request fails immediately with an informative error instead of waiting silently. Set to `0` to disable the cap. |

#### Example: Long-Running Local Inference

For local inference or slower provider responses:

```json
{
  "retry": {
    "enabled": true,
    "maxRetries": 3,
    "baseDelayMs": 2000,
    "provider": {
      "timeoutMs": 3600000,
      "maxRetries": 0,
      "maxRetryDelayMs": 60000
    }
  }
}
```

This configuration:

- Sets a 1-hour timeout for provider requests (`timeoutMs: 3600000`)
- Allows providers to retry without additional agent-level retries (`maxRetries: 0`)
- Caps any server-requested retry delay at 60 seconds (`maxRetryDelayMs: 60000`)

### Model & Thinking

| Setting                | Type    | Default | Description                                                    |
| ---------------------- | ------- | ------- | -------------------------------------------------------------- |
| `defaultProvider`      | string  | -       | Default provider (e.g., `"anthropic"`, `"deepseek"`)           |
| `defaultModel`         | string  | -       | Default model ID                                               |
| `defaultThinkingLevel` | string  | -       | `"off"`, `"minimal"`, `"low"`, `"medium"`, `"high"`, `"xhigh"` |
| `hideThinkingBlock`    | boolean | `false` | Hide thinking blocks in output                                 |
| `thinkingBudgets`      | object  | -       | Custom token budgets per thinking level                        |

### UI & Display

| Setting              | Type    | Default  | Description                                               |
| -------------------- | ------- | -------- | --------------------------------------------------------- |
| `theme`              | string  | `"dark"` | Theme name (`"dark"`, `"light"`, or custom)               |
| `quietStartup`       | boolean | `false`  | Hide startup header                                       |
| `collapseChangelog`  | boolean | `false`  | Show condensed changelog after updates                    |
| `doubleEscapeAction` | string  | `"tree"` | Action for double-escape: `"tree"`, `"fork"`, or `"none"` |

### Compaction

| Setting                       | Type    | Default | Description                            |
| ----------------------------- | ------- | ------- | -------------------------------------- |
| `compaction.enabled`          | boolean | `true`  | Enable auto-compaction                 |
| `compaction.reserveTokens`    | number  | `16384` | Tokens reserved for LLM response       |
| `compaction.keepRecentTokens` | number  | `20000` | Recent tokens to keep (not summarized) |

## Project Overrides

Project settings (`.pi/settings.json`) override global settings. Nested objects are merged:

```json
// ~/.pi/agent/settings.json (global)
{
  "theme": "dark",
  "retry": { "enabled": true, "baseDelayMs": 2000 }
}

// .pi/settings.json (project)
{
  "retry": { "baseDelayMs": 4000 }
}

// Result (merged)
{
  "theme": "dark",
  "retry": { "enabled": true, "baseDelayMs": 4000 }
}
```

## Best Practices

### Provider Timeout Configuration

- **Development/Testing:** Use shorter timeouts to catch issues quickly
- **Local Inference:** Increase `retry.provider.timeoutMs` to accommodate slower models
- **Production:** Balance between reliability and responsiveness

### Retry Strategy

1. **Short operations:** Lower `baseDelayMs` (e.g., 1000ms)
2. **Long operations:** Higher `baseDelayMs` and `timeoutMs` (e.g., 5000ms and 300000ms)
3. **Critical operations:** Increase `maxRetries` with appropriate backoff
