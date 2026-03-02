# Claude Code Guide

Development patterns and conventions for the Superbloom monorepo.

## Repository Structure

```
sb/
├── nixos/              # NixOS system configuration
├── flux/               # Kubernetes GitOps with Flux CD
└── nexus/              # Application services (Turborepo + Bun workspace)
    ├── apps/
    │   ├── api/        # Elysia API control plane
    │   ├── bot/        # Discord bot (The Machine)
    │   └── ui/         # React web dashboard
    ├── packages/
    │   ├── core/       # Shared business logic, Drizzle schemas
    │   ├── k8s/        # Kubernetes client wrapper
    │   ├── logger/     # Structured JSON logging (Pino)
    │   └── mc-monitor/ # Minecraft server protocol library
    └── workers/
        ├── agent/      # AI agent background worker
        └── mc-monitor/ # Game server status polling
```

## Type System

**Never use `type` or `interface` directly.** Use schema-first definitions:

| Location | Schema Library | Example |
|----------|---------------|---------|
| Server-side (Nexus) | Elysia `t.*` | `t.Object({ id: t.String() })` |
| Client-only | Zod | `z.object({ id: z.string() })` |

### Server Types (Elysia)

Define schemas in `types.ts`, derive TypeScript types with `.static`:

```typescript
// packages/core/src/domains/agent/types.ts
import { t } from "elysia";

export const MessagePartSchema = t.Object({
  type: t.String(),
  content: t.Optional(t.String()),
});

// Derive TS type from schema
export type MessagePartType = typeof MessagePartSchema.static;
```

### Client Types

UI and Bot **never define their own types** for API data. They import from API via Eden Treaty:

```typescript
// CORRECT - types flow from API
import type { App } from "@nexus/api/app";
const client = treaty<App>(API_URL);
const { data } = await client.api.servers.get();
// data is fully typed from API schemas

// WRONG - never duplicate types
interface Server { name: string; } // Don't do this
```

## Domain Structure

Each domain in `packages/core/src/domains/<name>/`:

```
├── schema.ts      # Drizzle table definitions
├── types.ts       # Elysia t.* schemas + derived types
├── functions.ts   # Business logic
├── repository.ts  # Database queries (optional)
├── routes.ts      # Elysia route handlers
├── index.ts       # Re-exports
└── k8s-adapter.ts # K8s integration (if needed)
```

**apps/api** is the thin API layer that composes routes from core:
- `apps/api/src/app.ts` - Elysia app composition
- `apps/api/src/routes/` - Route groups (private, public, webhooks)

### Type Flow

```
types.ts (MessagePartSchema)
    ↓
functions.ts (uses MessagePartType)
    ↓
routes.ts (validates with MessagePartSchema, returns typed responses)
    ↓
Eden Treaty (infers types for UI/Bot)
```

## Real-time Events

WebSocket events via `/api/events`:

**Backend** - Emit events from anywhere:
```typescript
import { appEvents } from "@nexus/core/infra/events";
appEvents.emit("conversation:updated", { id, title });
```

**Frontend** - Subscribe with hook:
```typescript
import { useEvents } from "../lib/useEvents";
useEvents("conversation:updated", (payload) => {
  // payload is typed
});
```

Event types defined in `packages/core/src/infra/events.ts`.

## Commands

**All commands run from `sb/nexus/` workspace root:**

```bash
# Development (uses Turborepo)
bun run dev:all        # All services with Turbo TUI
bun run dev:api        # API on :3000
bun run dev:ui         # Dashboard on :3001
bun run dev:bot        # Discord bot
bun run dev:workers    # All background workers

# Quality checks (parallel via Turborepo)
bun run test           # Run all tests
bun run typecheck      # TypeScript check all packages
bun run check          # Biome check all packages

# Docker builds
bun run docker:build:all  # Build all Docker images

# Drizzle migrations
bun run db:generate    # Generate all migrations
bun run db:migrate     # Run migrations
```

## Shell Tools

| Tool | Purpose | Example |
|------|---------|---------|
| `rg` (ripgrep) | Fast text search | `rg "pattern" --type ts` |
| `fd` | Fast file finder | `fd "schema" --extension ts` |
| `fzf` | Fuzzy finder | `fd \| fzf` |
| `eza` | Better ls | `eza --tree --level=2 apps/` |

### Useful Searches

```bash
# Find all route definitions
rg "new Elysia" packages/core/src

# Find all Drizzle schemas
fd schema.ts packages/core

# Find all API endpoints
rg "\.get\(|\.post\(|\.patch\(|\.delete\(" packages/core/src/domains

# Find environment variable usage
rg "config\." packages/core/src

# Find event emissions
rg "appEvents.emit" packages/core/src
```

## Key Files

| File | Purpose |
|------|---------|
| `packages/core/src/domains/*/types.ts` | Domain schemas |
| `packages/core/src/infra/events.ts` | WebSocket event definitions |
| `packages/core/src/infra/config.ts` | Environment variables |
| `apps/api/src/app.ts` | Elysia API composition |
| `apps/ui/src/lib/api.ts` | Eden Treaty client |
| `apps/ui/src/lib/useEvents.ts` | WebSocket hook |

## Ops Architecture

All infrastructure operations (kubectl, flux, helm) execute via **Tailscale SSH** to the `superbloom` host. This applies whether running locally or in-cluster - the pods have Tailscale sidecars configured.

```typescript
// packages/core/src/domains/ops/functions.ts
// Always uses SSH, never local execution
async function executeKubectl(command: string) {
  return executeSSH(`kubectl ${command}`);
}
```
