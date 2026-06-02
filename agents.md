# Agent Guide

Quick reference for AI agents working on the Superbloom homelab.

## Environment

- **Development:** WSL2 (Ubuntu) / Mac Mini
- **Production:** NixOS (Superbloom server)
- **Agent Runtime:** Hermes (Python-based, deployed on K3s)
- **MCP Servers:** Python asyncio over stdio

## Project Structure

```
sb/
├── nixos/                # NixOS system configuration
├── argocd/               # ArgoCD application definitions
├── flux/                 # Bootstrap-only Flux manifests
├── hermes/               # Hermes Agent config, skills, SOUL
├── mcp-servers/          # Python MCP servers (k8s, kserve, grafana)
└── docs/                 # Documentation and research notes
```

## Available Tools

| Tool | Purpose | Example |
|------|---------|---------|
| `rg` (ripgrep) | Fast text search | `rg "pattern" --type py` |
| `fd` | Fast file finder | `fd "server.py" mcp-servers/` |
| `fzf` | Fuzzy finder | `fd | fzf` |
| `eza` | Better ls | `eza --tree --level=2 mcp-servers/` |

## Hermes Agent

Hermes is the autonomous operator. It reads `hermes/config.yaml` on startup, connects to MCP servers, and executes skills from `hermes/skills/`.

### Key Files

| File | Purpose |
|------|---------|
| `hermes/config.yaml` | Model provider, MCP server list, cron jobs |
| `hermes/SOUL.md` | Personality, directives, constraints |
| `hermes/skills/*.md` | Procedures Hermes can execute |

### Config Changes

Edit `hermes/config.yaml` to add MCP servers or cron jobs. ArgoCD redeploys Hermes automatically on push to `main`.

## MCP Servers

Standalone Python tools in `mcp-servers/`. Each exposes domain-specific tools to Hermes via the Model Context Protocol.

| Server | Purpose |
|--------|---------|
| `mcp-k8s` | Cluster operations (pods, logs, deployments) |
| `mcp-kserve` | Model serving lifecycle |
| `mcp-grafana` | PromQL queries, alerts, annotations |

### Development

```bash
cd mcp-servers/mcp-k8s  # or mcp-kserve, mcp-grafana
python server.py        # Test locally
```

## Useful Searches

```bash
# Find all MCP server entry points
fd "server.py" mcp-servers/

# Find all Hermes skills
fd "*.md" hermes/skills/

# Find Hermes config references
rg "mcp_servers" hermes/

# Find ArgoCD app definitions
fd "app.yaml" argocd/

# Find SOPS-encrypted secrets
rg "sops" argocd/
```

## Deployment Flow

1. Push to `main` branch
2. ArgoCD detects changes and reconciles the cluster
3. Hermes and MCP servers deployed to K3s on Superbloom
4. NixOS changes require `sudo nixos-rebuild switch --flake ./nixos#superbloom`
