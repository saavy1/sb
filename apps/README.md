# Apps

Bun workspace monorepo for Superbloom applications.

## Packages

| Package | Description |
|---------|-------------|
| [`nexus`](./nexus) | Elysia API control plane - multi-domain backend for homelab automation |
| [`the-machine`](./the-machine) | Discord bot for managing game servers |
| [`dashboard`](./dashboard) | React web dashboard for game servers and homelab management |

## Quick Start

```bash
# Install all dependencies
bun install

# Run services in development
bun run dev:api        # Nexus API on :3000
bun run dev:bot        # The Machine bot
bun run dev:dashboard  # Dashboard on :3001

# Type check all packages
bun run typecheck
```

## Scripts

| Script | Description |
|--------|-------------|
| `dev:api` | Run Nexus API with hot reload |
| `dev:bot` | Run The Machine bot with hot reload |
| `dev:dashboard` | Run Dashboard with hot reload |
| `typecheck` | Type check all packages |
| `typecheck:api` | Type check Nexus only |
| `typecheck:bot` | Type check The Machine only |
| `typecheck:dashboard` | Type check Dashboard only |
| `db:push` | Push Drizzle schema to SQLite |

## Container Images

Images are automatically built and pushed to GHCR on push to main.

```bash
docker pull ghcr.io/saavy1/nexus:latest
docker pull ghcr.io/saavy1/the-machine:latest
docker pull ghcr.io/saavy1/dashboard:latest
```

## Architecture

```
The Machine (Discord) ──┐
                        ├──► Nexus API ──► K8s API
Dashboard (Web UI) ─────┘       │
                                ▼
                           SQLite DBs
                    (multiple per domain)
```

**Nexus** is the core Elysia control plane providing multi-domain APIs. **The Machine** (Discord bot) and **Dashboard** (web UI) are thin clients that consume Nexus APIs via Eden Treaty.
