# Superbloom Monorepo

A complete homelab infrastructure stack combining NixOS system configuration, Kubernetes GitOps, and custom applications for server management and automation.

## Overview

This monorepo manages the entire **Superbloom** homelab infrastructure, from bare metal OS configuration to application deployment. It includes three main components that work together to provide a declarative, version-controlled infrastructure.

### Naming

- **Superbloom**: The physical server and infrastructure
- **Nexus**: The Elysia API control plane - a multi-domain backend providing APIs for homelab automation
- **The Machine**: Discord bot for game server management

## Repository Structure

```
sb/
├── .github/workflows/  # CI/CD for building container images
├── nixos/              # NixOS system configuration
├── flux/               # Kubernetes GitOps with Flux CD
└── nexus/              # Application services (Turborepo + Bun workspace)
    ├── apps/
    │   ├── api/        # Elysia API control plane
    │   ├── bot/        # Discord bot (The Machine)
    │   └── ui/         # React web dashboard
    ├── packages/
    │   ├── core/       # Shared business logic, schemas, Drizzle
    │   ├── k8s/        # Kubernetes client wrapper
    │   ├── logger/     # Structured JSON logging (Pino)
    │   └── mc-monitor/ # Minecraft server protocol library
    └── workers/
        ├── agent/      # AI agent background worker
        ├── embeddings/ # Embeddings generation worker
        └── mc-monitor/ # Game server status polling
```

### nixos/ - NixOS Configuration

Declarative NixOS configuration for the Superbloom server using Nix Flakes.

**Key Technologies:**
- NixOS 25.11
- Home Manager
- K3s (Kubernetes)
- Docker
- Tailscale VPN

**What it manages:**
- Operating system configuration
- K3s cluster setup
- Container runtime (Docker)
- Networking and firewall rules
- User environments and shell configuration

### flux/ - Kubernetes GitOps

Flux CD GitOps repository managing all Kubernetes deployments on the Superbloom K3s cluster.

**Key Technologies:**
- Flux CD v2.7.3
- Helm
- Kustomize
- SOPS (secrets encryption)

**What it deploys:**
- Caddy Ingress Controller
- Authelia (SSO/authentication)
- Cloudflare DDNS
- Custom applications from sb-apps

### nexus/ - Application Services

Turborepo + Bun workspace monorepo containing custom applications for homelab automation.

**Key Technologies:**
- Turborepo for task orchestration and caching
- Bun runtime and package manager
- TypeScript
- Elysia (backend framework)
- discord.js (Discord bot)
- React 19 (web dashboard)
- SQLite + PostgreSQL + Drizzle ORM
- BullMQ (job queues)

**Apps:**

| Package | Description |
|---------|-------------|
| `@nexus/api` | Elysia API control plane with multi-domain backend |
| `@nexus/bot` | Discord bot for game server management (The Machine) |
| `@nexus/ui` | React web dashboard with TanStack Router |

**Packages:**

| Package | Description |
|---------|-------------|
| `@nexus/core` | Shared business logic, Drizzle schemas, domain services |
| `@nexus/k8s` | Kubernetes client wrapper |
| `@nexus/logger` | Structured JSON logging via Pino |
| `@nexus/mc-monitor` | Minecraft server protocol library |

**Workers:**

| Package | Description |
|---------|-------------|
| `@nexus/worker-agent` | AI agent background worker with K8s/Flux tools |
| `@nexus/worker-embeddings` | Document embeddings generation |
| `@nexus/worker-mc-monitor` | Game server status polling service |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ nixos/ (NixOS Configuration)                            │
│ ├─ Provisions the base OS                              │
│ ├─ Installs and configures K3s cluster                 │
│ └─ Sets up Docker, networking, users                   │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│ flux/ (Flux GitOps)                                     │
│ ├─ Deploys infrastructure (Caddy, Authelia, DDNS)      │
│ ├─ Deploys applications from nexus/                    │
│ ├─ Manages Kubernetes manifests declaratively          │
│ └─ Watches Git repo, auto-reconciles cluster state     │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│ nexus/ (Applications)                                   │
│                                                         │
│ ┌─────────────────────────────────────────────┐        │
│ │ @nexus/api (Elysia Control Plane)           │        │
│ │ └─ @nexus/core (domains, schemas, services) │        │
│ └────────────┬────────────────────────────────┘        │
│              │                                          │
│     ┌────────┼─────────┐                               │
│     ▼        ▼         ▼                                │
│ ┌───────┐ ┌─────┐ ┌─────────────────┐                  │
│ │ @bot  │ │ @ui │ │ @workers/*      │                  │
│ │Discord│ │React│ │agent,embeddings │                  │
│ └───────┘ └─────┘ └─────────────────┘                  │
└─────────────────────────────────────────────────────────┘
```

## Development

Each subdirectory has its own development workflow:

**NixOS:**
```bash
cd nixos
nixos-rebuild build --flake .#superbloom
```

**Flux:**
```bash
flux check
flux reconcile kustomization flux-system
```

**Applications (from nexus/):**
```bash
bun install
bun run dev:all        # All services with Turbo TUI
bun run dev:api        # API only on :3000
bun run dev:ui         # Dashboard on :3001
bun run dev:bot        # Discord bot
bun run dev:workers    # All background workers

# Quality checks (parallel via Turborepo)
bun run typecheck      # Type check all packages
bun run check          # Lint all packages
bun run docker:build:all  # Build all Docker images
```

## Contributing

This is a personal homelab infrastructure repository. If you're interested in the architecture or want to use it as inspiration for your own setup, feel free to explore!

## License

Private - All Rights Reserved
