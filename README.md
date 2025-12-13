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
├── sb-system/          # NixOS system configuration
├── sb-cluster/         # Kubernetes GitOps with Flux CD
└── sb-apps/            # Application services (Bun monorepo)
```

### sb-system - NixOS Configuration

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

### sb-cluster - Kubernetes GitOps

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

### sb-apps - Application Services

Bun workspace monorepo containing custom applications for homelab automation.

**Key Technologies:**
- Bun runtime and package manager
- TypeScript
- Elysia (backend framework)
- discord.js (Discord bot)
- React 19 (web dashboard)
- SQLite + Drizzle ORM

**Applications:**

#### elysia-backend (→ Nexus)
Central Elysia API control plane providing multi-domain backend services. Currently handles game server management with plans to expand to additional domains (app launcher, system monitoring, etc.).

- Multiple SQLite databases (one per domain)
- Domain-driven architecture
- Kubernetes integration for game server deployment
- OpenAPI/Swagger documentation

#### docker-discord-bot (→ The Machine)
Discord bot providing game server management through slash commands. Thin client consuming the game-servers domain from Nexus.

- Discord.js v15
- Eden Treaty client (type-safe RPC to Nexus)
- Zod validation

#### elysia-frontend (→ Dashboard)
React web dashboard for managing game servers and (eventually) other homelab services.

- TanStack Router (type-safe routing)
- Tailwind CSS v4
- Eden Treaty client to Nexus API
- Vite build tooling

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ sb-system (NixOS)                                       │
│ ├─ Provisions the base OS                              │
│ ├─ Installs and configures K3s cluster                 │
│ └─ Sets up Docker, networking, users                   │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│ sb-cluster (Flux GitOps)                                │
│ ├─ Deploys infrastructure (Caddy, Authelia, DDNS)      │
│ ├─ Deploys applications from sb-apps                   │
│ ├─ Manages Kubernetes manifests declaratively          │
│ └─ Watches Git repo, auto-reconciles cluster state     │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│ sb-apps (Applications)                                  │
│                                                         │
│ ┌─────────────────────────────────────────────┐        │
│ │ Nexus (Elysia API)                          │        │
│ │ - Multi-domain control plane                │        │
│ │ - Game servers, launcher, future domains    │        │
│ │ - Multiple SQLite DBs                       │        │
│ └────────────┬────────────────────────────────┘        │
│              │                                          │
│     ┌────────┴─────────┐                               │
│     ▼                  ▼                                │
│ ┌─────────────┐  ┌──────────────┐                      │
│ │ The Machine │  │  Dashboard   │                      │
│ │ (Discord)   │  │  (Web UI)    │                      │
│ └─────────────┘  └──────────────┘                      │
└─────────────────────────────────────────────────────────┘
```

## Current Status

This is the original multi-repo structure. Plans are in progress to consolidate into a unified monorepo with the following structure:

```
sb/
├── .github/workflows/      # Unified CI/CD
├── nixos/                  # NixOS config (standalone)
├── flux/                   # Flux manifests (standalone)
├── apps/                   # Bun workspace
│   ├── nexus/              # Elysia API control plane
│   ├── the-machine/        # Discord bot
│   └── dashboard/          # Web UI
├── docs/
├── scripts/
├── Taskfile.yml            # Optional task automation
└── README.md
```

## Development

Each subdirectory has its own development workflow:

**sb-system (NixOS):**
```bash
cd sb-system
nixos-rebuild build --flake .#superbloom
```

**sb-cluster (Flux):**
```bash
cd sb-cluster
flux check
flux reconcile kustomization flux-system
```

**sb-apps (Applications):**
```bash
cd sb-apps
bun install
bun run dev:api        # Nexus API on :3000
bun run dev:bot        # The Machine bot
bun run dev:frontend   # Dashboard on :3001
```

## Contributing

This is a personal homelab infrastructure repository. If you're interested in the architecture or want to use it as inspiration for your own setup, feel free to explore!

## License

Private - All Rights Reserved
