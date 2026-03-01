# Superbloom Monorepo

Homelab infrastructure stack: NixOS system configuration, Kubernetes GitOps (ArgoCD + Flux bootstrap), and custom applications for server management and automation.

## Overview

This monorepo manages the entire **Superbloom** homelab infrastructure, from bare metal OS configuration to application deployment. Everything is declarative and version-controlled.

### Naming

- **Superbloom**: The physical server and infrastructure
- **Nexus**: The application platform — API control plane, web dashboard, Discord bot, AI agent
- **The Machine**: Discord bot personality for infrastructure and game server management

## Repository Structure

```
sb/
├── .github/workflows/  # CI/CD — build container images, push to Zot registry
├── nixos/              # NixOS system configuration (K3s, networking, users)
├── argocd/             # Primary GitOps — ArgoCD application definitions
├── flux/               # Bootstrap-only — ArgoCD, Infisical, CNPG operator
└── nexus/              # Application services (Turborepo + Bun workspace)
    ├── apps/
    │   ├── api/        # Elysia API control plane
    │   ├── bot/        # Discord bot (The Machine)
    │   └── ui/         # React web dashboard
    ├── packages/
    │   ├── core/       # Shared business logic, schemas, Drizzle ORM
    │   ├── k8s/        # Kubernetes client wrapper
    │   ├── logger/     # Structured JSON logging (Pino)
    │   └── mc-monitor/ # Minecraft server protocol library
    └── workers/
        ├── agent/      # AI agent background worker
        ├── embeddings/ # Document embeddings generation
        └── mc-monitor/ # Game server status polling
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ nixos/ — Base OS                                            │
│ ├─ NixOS + K3s cluster                                     │
│ ├─ Docker, Tailscale VPN, networking                       │
│ └─ User environments and shell config                      │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ flux/ — Bootstrap Layer                                     │
│ ├─ ArgoCD (installs the GitOps engine itself)              │
│ ├─ Infisical (secrets management)                          │
│ └─ CNPG Operator (PostgreSQL)                              │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ argocd/ — Primary GitOps                                    │
│ ├─ Infrastructure: Caddy, Authelia, DDNS, Monitoring,      │
│ │   Zot Registry, Kargo, External Secrets, Argo Workflows  │
│ ├─ Nexus: API, Bot, Agent Worker, MC Monitor               │
│ ├─ Media: Jellyfin, Sonarr, Radarr, SABnzbd, etc.         │
│ ├─ Games: Minecraft server infrastructure                   │
│ └─ Data: Valkey (Redis-compatible)                          │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ nexus/ — Applications                                       │
│ ┌─────────────────────────────────────────────┐             │
│ │ @nexus/api (Elysia Control Plane)           │             │
│ │ └─ @nexus/core (domains, schemas, services) │             │
│ └────────────┬────────────────────────────────┘             │
│     ┌────────┼─────────┐                                    │
│     ▼        ▼         ▼                                    │
│  @bot      @ui     @workers/*                               │
│  Discord   React   agent, embeddings, mc-monitor            │
└─────────────────────────────────────────────────────────────┘
```

## Key Technologies

| Layer | Technologies |
|-------|-------------|
| OS | NixOS, K3s, Tailscale |
| GitOps | ArgoCD, Flux (bootstrap), Kargo (promotions) |
| Secrets | Infisical, External Secrets Operator |
| Ingress | Caddy, Authelia (SSO), Cloudflare DDNS |
| Monitoring | Prometheus, Grafana, Loki, Tempo, Alloy |
| Registry | Zot (self-hosted OCI registry) |
| Runtime | Bun, TypeScript, Turborepo |
| Backend | Elysia, Drizzle ORM, BullMQ |
| Frontend | React 19, TanStack Router |
| AI | Claude API, tool-use agent with K8s/ArgoCD tools |
| Databases | SQLite, PostgreSQL (CNPG), Valkey |

## Development

```bash
# NixOS
cd nixos && nixos-rebuild build --flake .#superbloom

# Applications (from nexus/)
cd nexus
bun install
bun run dev:all        # All services
bun run typecheck      # Type check all packages
bun run check          # Lint all packages
```

## Domain

All services are exposed at `*.saavylab.dev` via Caddy reverse proxy with Authelia SSO.
