# Superbloom Homelab

Declarative homelab infrastructure: NixOS system configuration, Kubernetes GitOps, and the Hermes Agent — an autonomous operator that manages the cluster, models, and services.

## Overview

**Hermes Agent** is the brain of the homelab. It monitors cluster health, manages ML model lifecycles on KServe, responds to alerts, and interfaces via Discord. Previously this was spread across a custom API, Discord bot, and agent worker; Hermes unifies all of that into a single operator with built-in skills and MCP tooling.

Everything remains declarative and version-controlled. NixOS configures the metal, ArgoCD manages the workloads, and Hermes keeps it all running.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Superbloom (control-plane)       DGX Spark (GPU worker)     │
│  ├─ NixOS + K3s server           ├─ DGX OS + K3s agent      │
│  ├─ AMD Ryzen 7, 64GB RAM        ├─ NVIDIA GB10, 128GB      │
│  ├─ Intel Arc A380 (transcoding)  ├─ KServe + Kubeflow        │
│  ├─ ZFS RAIDZ2 (8x8TB)          └─ vLLM model serving        │
│  └─ Samba file shares                                        │
│                                                             │
│  Connected via Tailscale VPN mesh                           │
│  Tailscale operator replaces per-app sidecars               │
└─────────────────────────────────────────────────────────────┘
```

## GitOps Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Flux — Bootstrap Layer                                     │
│  └─ ArgoCD (installs the GitOps engine itself)              │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│  ArgoCD — Primary GitOps                                   │
│  ├─ Infra: Caddy, Authelia, DDNS, PromStack,            │
│  │    Zot Registry, External Secrets,                  │
│  │    Argo Workflows, NVIDIA GPU Operator,               │
│  │    Home Assistant                                       │
│  ├─ AI: KServe (model serving), vLLM ServingRuntime      │
│  ├─ Hermes: Agent deployment + MCP servers                │
│  ├─ Media: Jellyfin, Sonarr, Radarr, SABnzbd, etc.       │
│  ├─ Games: Minecraft server infrastructure                │
│  └─ Data:                                                 │
└────────────────────────────────────────────────────────────┘
```

## Hardware

| Node | Hardware | Role |
|------|----------|------|
| **Superbloom** | AMD Ryzen 7 5700G, 64GB RAM, Intel Arc A380, ZFS RAIDZ2 (8x8TB) | Control plane, storage, transcoding, general workloads |
| **DGX Spark** | NVIDIA GB10 Blackwell, 128GB unified memory, ARM64 | GPU compute, KServe model serving, Kubeflow pipelines |
| **Mac Mini** | Apple Silicon (local) | Development, local testing |

## Repository Structure

```
sb/
├── .github/workflows/     # CI/CD — NixOS deploy, Droid agents, image builds
├── nixos/                 # NixOS system configuration (K3s, Tailscale, ZFS)
├── argocd/                # Primary GitOps — ArgoCD application definitions
├── flux/                  # Bootstrap-only — installs ArgoCD
├── hermes/                # Hermes Agent config, skills, SOUL
│   ├── config.yaml        # Agent runtime configuration
│   ├── SOUL.md            # Personality and directives
│   └── skills/            # Built-in agent skills (self-healer, model-manager)
├── mcp-servers/           # Standalone Python MCP servers
│   ├── mcp-k8s/           # Kubernetes MCP server
│   ├── mcp-kserve/        # KServe model management MCP server
│   └── mcp-grafana/       # Grafana / PromStack MCP server
└── docs/                  # Documentation and research notes
```

## Key Technologies

| Layer | Technologies |
|-------|-------------|
| OS | NixOS, K3s, Tailscale |
| GPU | NVIDIA GPU Operator, KServe, vLLM, Kubeflow |
| GitOps | ArgoCD (primary), Flux (bootstrap only) |
| Secrets | SOPS + External Secrets Operator (replaced Infisical) |
| Ingress | Caddy, Authelia (SSO), Cloudflare DDNS |
| Monitoring | Prometheus, Grafana, Loki, Tempo, Alloy |
| Home Automation | Home Assistant, Whisper (STT), Piper (TTS), openWakeWord |
| Registry | Zot (self-hosted OCI registry) |
| Storage | ZFS RAIDZ2, Samba (NAS), local-path provisioner |
| Agent | Hermes Agent, MCP servers, DeepSeek fallback |
| Databases | SQLite (Hermes memory), PostgreSQL |

## Development

```bash
# NixOS
cd nixos && nixos-rebuild build --flake .#superbloom

# Hermes Agent
cd hermes
# Edit config.yaml, SOUL.md, or skills/*.md
# ArgoCD reconciles the deployment automatically on push

# MCP Servers
cd mcp-servers/mcp-k8s      # or mcp-kserve, mcp-grafana
python server.py            # Run locally for testing
```

### MCP Server Development

MCP servers are standalone Python tools that expose capabilities to Hermes:

- **mcp-k8s** — Pod logs, describe resources, restart deployments, node status
- **mcp-kserve** — List/load/unload models, check InferenceService health
- **mcp-grafana** — PromQL queries, alert status, dashboard annotations

Each server implements the Model Context Protocol over stdio. Hermes connects to them via the `mcp_servers` list in `hermes/config.yaml`.

### Adding a Skill

Skills are Markdown documents in `hermes/skills/` that define procedures Hermes can execute. A skill has:
- Purpose statement
- Step-by-step procedure
- Recovery patterns (if applicable)
- Annotation requirements

## Quick Start

1. **Bootstrap Flux** (one-time): `flux bootstrap github ...` (see `flux/README.md`)
2. **ArgoCD takes over** — all apps sync from `argocd/clusters/superbloom/`
3. **Hermes starts** — reads `hermes/config.yaml`, connects MCP servers, begins monitoring
4. **Models load** — Model Manager skill checks KServe and loads the highest-priority model
5. **Cluster self-heals** — Self-Healer skill triages PromStack alerts every 2 minutes

For day-to-day operations, push changes to `main` and ArgoCD reconciles automatically.
