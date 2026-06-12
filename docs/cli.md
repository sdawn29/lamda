# CLI Reference

## npm Scripts

### Root Level

```sh
npm run dev          # Start all apps in development mode
npm run build        # Build all apps and packages
npm run lint         # Run lint checks
npm run check-types  # TypeScript type checking
npm run format       # Format code with Prettier
```

---

### Web App

```sh
npm run dev -w web          # Start Vite dev server (http://localhost:5173)
npm run build -w web        # Build production bundle
npm run lint -w web         # Lint web app
npm run check-types -w web  # Type-check web app
```

---

### Server

```sh
npm run dev -w @lamda/server          # Start server with tsx (port 3001)
npm run build -w @lamda/server        # Build CJS bundle
npm run start -w @lamda/server         # Run production bundle
npm run lint -w @lamda/server          # Lint server
npm run check-types -w @lamda/server   # Type-check server
```

---

### Desktop App

```sh
npm run dev -w desktop           # Start Electron with hot reload
npm run build -w desktop         # Build macOS .dmg/.zip
npm run lint -w desktop          # Lint desktop app
npm run check-types -w desktop   # Type-check desktop app
```

---

### Packages

```sh
npm run build -w @lamda/db       # Build database package
npm run build -w @lamda/git      # Build git package
npm run build -w @lamda/pi-sdk   # Build SDK package
```

---

## Turborepo Pipeline

The `turbo.json` defines the build pipeline:

| Task | Description |
|------|-------------|
| `build` | Compile TypeScript and bundle assets |
| `dev` | Start development servers with hot reload |
| `lint` | Run ESLint |
| `check-types` | Run TypeScript compiler |

### Workspace Dependencies

Tasks respect dependencies between workspaces:
- `desktop` depends on `server`, `web`
- `server` depends on `db`, `git`, `pi-sdk`
- `web` depends on packages

---

## Environment Variables

### Development

```sh
# Override server URL (default: http://localhost:3001)
VITE_SERVER_URL=http://localhost:3001 npm run dev -w web

# Override server port (default: 3001)
PORT=3002 npm run dev -w @lamda/server
```

---

## Build Artifacts

| Workspace | Output Directory | Format |
|-----------|-----------------|--------|
| `web` | `apps/web/dist/` | ESM + Vite chunks |
| `server` | `apps/server/dist/` | CommonJS (`server.cjs`) |
| `desktop` | `apps/desktop/release/` | `.dmg`, `.zip` (macOS arm64) |

---

## Release Management

```sh
npm run release            # Auto-detect bump type from conventional commits
npm run release:dry-run    # Preview without making changes
node scripts/release.mjs --patch   # Force patch bump
node scripts/release.mjs --minor   # Force minor bump
node scripts/release.mjs --major   # Force major bump
```

The release script analyzes conventional commits since the last tag, bumps the version, updates `CHANGELOG.md`, syncs all workspace `package.json` versions, then commits, tags, and pushes to origin.