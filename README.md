# Superbloom Monorepo

Homelab infrastructure stack: NixOS system configuration, Kubernetes GitOps (ArgoCD + Flux bootstrap), and custom applications for server management and automation.

## Overview

This monorepo manages the entire **Superbloom** homelab infrastructure, from bare metal OS configuration to application deployment. Everything is declarative and version-controlled.

### Naming

- **Superbloom**: The primary server (NixOS, AMD Ryzen 7 5700G, 64GB RAM, Intel Arc A380)
- **GX10**: GPU compute node (Ascent GX10, NVIDIA GB10 Blackwell, 128GB unified memory, ARM64)
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
        └── mc-monitor/ # Game server status polling
```

## Cluster Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ superbloom (control-plane)              gx10 (GPU worker)   │
│ ├─ NixOS + K3s server                  ├─ DGX OS + K3s agent│
│ ├─ AMD Ryzen 7, 64GB RAM              ├─ NVIDIA GB10, 128GB│
│ ├─ Intel Arc A380 (transcoding)        ├─ vLLM / KServe    │
│ ├─ ZFS RAIDZ2 (8x8TB)                 └─ NAS models mount  │
│ └─ Samba file shares                                        │
│                                                             │
│ Connected via Tailscale VPN, Flannel CNI over tailscale0    │
└─────────────────────────────────────────────────────────────┘
```

## GitOps Layers

```
┌────────────────────────────────────────────────────────────────┐
│ flux/ — Bootstrap Layer                                        │
│ ├─ ArgoCD (installs the GitOps engine itself)                 │
│ ├─ Infisical (secrets management)                             │
│ └─ CNPG Operator (PostgreSQL)                                 │
└────────────────────┬───────────────────────────────────────────┘
                     │
┌────────────────────▼───────────────────────────────────────────┐
│ argocd/ — Primary GitOps                                       │
│ ├─ Infrastructure: Caddy, Authelia, DDNS, Monitoring,         │
│ │   Zot Registry, Kargo, External Secrets, Argo Workflows,    │
│ │   NVIDIA GPU Operator, Home Assistant                       │
│ ├─ AI: KServe (model serving), vLLM ServingRuntime            │
│ ├─ Nexus: API, Bot, Agent Worker, MC Monitor, MCP Servers     │
│ ├─ Media: Jellyfin, Sonarr, Radarr, SABnzbd, etc.            │
│ ├─ Games: Minecraft server infrastructure                      │
│ └─ Data: Valkey (Redis-compatible)                             │
└────────────────────┬───────────────────────────────────────────┘
                     │
┌────────────────────▼───────────────────────────────────────────┐
│ nexus/ — Applications                                          │
│ ┌─────────────────────────────────────────────┐                │
│ │ @nexus/api (Elysia Control Plane)           │                │
│ │ └─ @nexus/core (domains, schemas, services) │                │
│ └────────────┬────────────────────────────────┘                │
│     ┌────────┼─────────┐                                       │
│     ▼        ▼         ▼                                       │
│  @bot      @ui     @workers/*                                  │
│  Discord   React   agent, mc-monitor                           │
└────────────────────────────────────────────────────────────────┘
```

## Key Technologies

| Layer | Technologies |
|-------|-------------|
| OS | NixOS, K3s, Tailscale, Flannel |
| GPU | NVIDIA GPU Operator, KServe, vLLM |
| GitOps | ArgoCD, Flux (bootstrap), Kargo (promotions) |
| Secrets | Infisical, External Secrets Operator |
| Ingress | Caddy, Authelia (SSO), Cloudflare DDNS |
| Monitoring | Prometheus, Grafana, Loki, Tempo, Alloy |
| Home Automation | Home Assistant, Whisper (STT), Piper (TTS), openWakeWord |
| Registry | Zot (self-hosted OCI registry) |
| Storage | ZFS RAIDZ2, Samba (NAS), local-path provisioner |
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
