# Homelab Images

Monorepo for homelab services and container images. Uses Bun workspaces.

## Packages

| Package | Description |
|---------|-------------|
| [`docker-discord-bot`](./docker-discord-bot) | Discord bot for managing game servers via Elysia API |
| [`homelab-elysia`](./homelab-elysia) | Central homelab API (game servers, automation, etc.) |

## Quick Start

```bash
# Install all dependencies
bun install

# Run services in development
bun run dev:api   # Elysia API on :3000
bun run dev:bot   # Discord bot

# Type check all packages
bun run typecheck
```

## Scripts

| Script | Description |
|--------|-------------|
| `dev:api` | Run Elysia API with hot reload |
| `dev:bot` | Run Discord bot with hot reload |
| `typecheck` | Type check all packages |
| `typecheck:api` | Type check Elysia only |
| `typecheck:bot` | Type check Discord bot only |
| `db:push` | Push Drizzle schema to SQLite |

## Container Images

Images are automatically built and pushed to GHCR on push to main.

```bash
docker pull ghcr.io/saavy1/caddy-cloudflare:latest
docker pull ghcr.io/saavy1/homelab-elysia:latest
docker pull ghcr.io/saavy1/docker-discord-bot:latest
```

## Adding a new image

1. Create a new directory with a `Dockerfile`
2. Copy `.github/workflows/template.yml` and update the paths/names
3. Push to trigger the build

## Architecture

```
Discord Bot ──► Elysia API ──► K8s API
                   │
                   ▼
               SQLite DBs
            (minecraft.sqlite, core.sqlite)
```

The Discord bot is a thin client that calls the Elysia API. Elysia manages game servers by generating K8s manifests and applying them via kubectl.
