# Getting Started

## Prerequisites

- **Node.js** 18+
- **npm** 11+
- **Git** installed and available on `PATH`
- **macOS on Apple Silicon** for packaged desktop builds

## Installation

```sh
# Clone the repository
git clone <repository-url>
cd lamda

# Install dependencies
npm install
```

## Running the Application

### Full Development Stack

```sh
npm run dev
```

This starts all apps in parallel via Turborepo:
- Web UI at `http://localhost:5173`
- Server at `http://localhost:3001`
- Desktop app (if Electron is configured)

### Individual Apps

```sh
# Web UI only (for browser testing)
npm run dev -w web

# Server only
npm run dev -w @lamda/server

# Desktop app
npm run dev -w desktop
```

## Building

### All Apps

```sh
npm run build
```

### Desktop App (macOS arm64)

```sh
npm run build -w desktop
```

Output: `apps/desktop/release/` containing `.dmg` and `.zip` artifacts.

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_SERVER_URL` | `http://localhost:3001` | Server URL for web UI |
| `PORT` | `3001` | Server port |

### Provider Configuration

Configure AI providers in the Settings UI or via `~/.pi/agent/auth.json`:

```json
{
  "anthropic": { "apiKey": "sk-..." },
  "openai": { "apiKey": "sk-..." }
}
```

See [providers.md](providers.md) for the full list of supported providers.

## Data Storage

| Location | Description |
|----------|-------------|
| `~/.lamda-code/db-v2.sqlite` | SQLite database with workspaces, threads, messages |
| `~/.pi/agent/auth.json` | API keys and provider credentials |
| `~/.lamda-code/logs/` | Application logs |

## Next Steps

- Read the [Architecture Overview](architecture.md) to understand how components fit together
- Explore the [API Reference](api.md) for server endpoints
- Configure your [AI Provider](providers.md)