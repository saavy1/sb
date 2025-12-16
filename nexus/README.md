# Nexus

Turborepo + Bun workspace monorepo for Superbloom applications.

## Structure

```
nexus/
├── apps/
│   ├── api/           # Elysia API control plane
│   ├── bot/           # Discord bot (The Machine)
│   └── ui/            # React web dashboard
├── packages/
│   ├── core/          # Shared business logic, Drizzle schemas
│   ├── k8s/           # Kubernetes client wrapper
│   ├── logger/        # Structured JSON logging (Pino)
│   └── mc-monitor/    # Minecraft server protocol library
└── workers/
    ├── agent/         # AI agent with K8s/Flux tools
    ├── embeddings/    # Document embeddings generation
    └── mc-monitor/    # Game server status polling
```

## Quick Start

```bash
# Install dependencies
bun install

# Run all services with Turbo TUI
bun run dev:all

# Or run individual services
bun run dev:api        # API on :3000
bun run dev:ui         # Dashboard on :3001
bun run dev:bot        # Discord bot
bun run dev:workers    # All background workers
```

## Scripts

| Script | Description |
|--------|-------------|
| `dev:all` | Run all services with Turbo TUI |
| `dev:api` | Run API with hot reload |
| `dev:ui` | Run dashboard with hot reload |
| `dev:bot` | Run Discord bot with hot reload |
| `dev:workers` | Run all workers with hot reload |
| `typecheck` | Type check all packages (parallel) |
| `check` | Lint all packages (parallel) |
| `docker:build:all` | Build all Docker images |
| `db:generate` | Generate Drizzle migrations |
| `db:migrate` | Run Drizzle migrations |

## Container Images

Images are automatically built and pushed to GHCR on push to main.

```bash
docker pull ghcr.io/saavy1/nexus:latest
docker pull ghcr.io/saavy1/the-machine:latest
docker pull ghcr.io/saavy1/nexus-agent-worker:latest
docker pull ghcr.io/saavy1/nexus-embeddings-worker:latest
docker pull ghcr.io/saavy1/nexus-mc-monitor:latest
```

## Architecture

```
Bot (Discord) ──────┐
                    ├──► API ──► K8s API
UI (Web) ───────────┘     │
                          ├──► SQLite DBs (ops, game-servers, apps)
                          ├──► PostgreSQL (agent state)
                          └──► Valkey + BullMQ (job queues)
                                    │
            ┌───────────────────────┼───────────────────────┐
            ▼                       ▼                       ▼
     worker-agent          worker-embeddings        worker-mc-monitor
```

**API** is the core Elysia control plane providing multi-domain APIs via `@nexus/core`.

**Bot** and **UI** are thin clients consuming API via Eden Treaty (type-safe RPC).

**Workers** process background jobs from BullMQ queues.
