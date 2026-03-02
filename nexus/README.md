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
    ├── agent/         # AI agent with K8s/ArgoCD tools
    └── mc-monitor/    # Game server status polling
```

## Quick Start

```bash
bun install
bun run dev:all        # All services with Turbo TUI

# Or individual services
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

## Architecture

```
Bot (Discord) ──────┐
                    ├──► API ──► K8s API (in-cluster + SSH)
UI (Web) ───────────┘     │
                          ├──► SQLite DBs (ops, game-servers, apps)
                          ├──► PostgreSQL (agent state)
                          └──► Valkey + BullMQ (job queues)
                                    │
            ┌───────────────────────┼──
            ▼                       ▼                      
     worker-agent          worker-mc-monitor
```

**API** is the core Elysia control plane. All business logic lives in `@nexus/core` organized by domain.

**Bot** and **UI** are thin clients consuming the API via Eden Treaty (type-safe RPC).

**Workers** process background jobs from BullMQ queues (Valkey-backed).

## Type System

All types flow from schema-first definitions using Elysia `t.*` schemas:

```
types.ts (schema) → functions.ts (logic) → routes.ts (API) → Eden Treaty (clients)
```

Bot and UI never define their own types for API data — they import from the API via Eden Treaty.

## Container Images

Built via GitHub Actions, pushed to self-hosted Zot registry (`registry.saavylab.dev`). Kargo handles image promotion to the cluster.

## Ops Architecture

All infrastructure operations (kubectl, SSH, ArgoCD) execute via **Tailscale SSH** to the `superbloom` host. Pods have Tailscale sidecars for connectivity.

## AI Agent

The agent worker uses Claude with tool-use to autonomously manage infrastructure:
- Game server CRUD (create, start, stop, delete Minecraft servers)
- ArgoCD sync and status checks
- NixOS rebuild triggers
- System stats and monitoring
- Alert response (via Alertmanager/Grafana webhooks)
