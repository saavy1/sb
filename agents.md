# Agent Guide

Quick reference for AI agents working on the Superbloom monorepo.

## Environment

- **Development:** WSL2 (Ubuntu)
- **Production:** NixOS (Superbloom server)
- **Runtime:** Bun
- **Package Manager:** Bun workspaces

## Project Structure

```
sb/
├── apps/                 # Bun workspace
│   ├── nexus/            # Elysia API (main backend)
│   ├── the-machine/      # Discord bot
│   ├── dashboard/        # React frontend (Vite)
│   └── logger/           # Shared Pino logger
├── flux/                 # Kubernetes GitOps manifests
├── nixos/                # NixOS system configuration
└── docs/                 # Documentation
```

## Available Tools

| Tool | Purpose | Example |
|------|---------|---------|
| `rg` (ripgrep) | Fast text search | `rg "pattern" --type ts` |
| `fd` | Fast file finder | `fd "schema" --extension ts` |
| `fzf` | Fuzzy finder | `fd | fzf` |
| `eza` | Better ls | `eza --tree --level=2 apps/` |

## Common Commands

```bash
# Install dependencies
bun install

# Development servers
bun run dev:api        # Nexus on :3000
bun run dev:bot        # The Machine
bun run dev:dashboard  # Dashboard on :3001

# Type checking
bun run typecheck      # All packages
bun run typecheck:api  # Nexus only

# Database
bun run db:push        # Push schema to SQLite

# Linting (Biome)
bun run lint
bun run format
```

## Nexus Domain Structure

Each domain in `apps/nexus/src/domains/` follows this pattern:

```
domains/<name>/
├── schema.ts      # Drizzle table definitions
├── types.ts       # Elysia t.* types for API contracts
├── service.ts     # Business logic
├── repository.ts  # Database queries (optional)
├── routes.ts      # Elysia route handlers
└── k8s-adapter.ts # K8s integration (if needed)
```

## Databases

Nexus uses multiple SQLite databases (one per domain):

| Database | Location | Domain |
|----------|----------|--------|
| `minecraft.sqlite` | `apps/nexus/db/` | game-servers |
| `core.sqlite` | `apps/nexus/db/` | core (users, jobs, permissions) |
| `system-info.sqlite` | `apps/nexus/db/` | system-info (drives) |

## Key Patterns

- **API clients:** Eden Treaty for type-safe RPC between apps
- **Logging:** Import `logger` from the shared `logger` package
- **Config:** Environment variables via `src/infra/config.ts`
- **Auth:** Authelia headers extracted in `src/middleware/authelia.ts`

> **IMPORTANT: Never redeclare types for API consumers.**
> 
> The Dashboard and The Machine must always import types from Nexus via Eden Treaty.
> Do NOT create duplicate type definitions in frontend or bot code.
> 
> ```typescript
> // CORRECT - import from Nexus
> import type { App } from "@nexus/app";
> const client = treaty<App>(API_URL);
> 
> // WRONG - never do this
> interface Server { name: string; status: string; } // duplicated type
> ```

## Useful Searches

```bash
# Find all route definitions
rg "new Elysia" apps/nexus/src

# Find all Drizzle schemas
fd schema.ts apps/nexus

# Find environment variable usage
rg "config\." apps/nexus/src

# Find all API endpoints
rg "\.get\(|\.post\(|\.patch\(|\.delete\(" apps/nexus/src/domains
```

## Deployment Flow

1. Push to `main` branch
2. GitHub Actions builds container images → GHCR
3. Flux CD detects new images and reconciles cluster
4. Apps deployed to K3s on Superbloom server
