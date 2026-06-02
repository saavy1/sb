# AGENTS.md

Guidelines for AI agents working on this homelab infrastructure.

## Project Overview

This is a NixOS-based homelab running K3s. **Flux is used only for bootstrapping** — it installs ArgoCD, and then ArgoCD manages all remaining workloads. This file covers the Flux bootstrap layer only. For the primary GitOps layer, see `argocd/README.md`.

### Monorepo Structure

| Directory | Purpose |
|-----------|---------|
| `nixos/` | NixOS system configuration for the Superbloom server |
| `flux/` | Bootstrap-only — installs ArgoCD |
| `argocd/` | Primary GitOps — all Kubernetes app deployments |
| `hermes/` | Hermes Agent configuration and skills |
| `mcp-servers/` | Standalone Python MCP servers |

### Server: Superbloom

- **OS:** NixOS (nixos-25.11)
- **Hardware:** AMD Ryzen 7 5700G, 64GB RAM, Intel Arc A380 (transcode), ZFS storage
- **Orchestration:** K3s
- **GitOps:** ArgoCD (primary), Flux (bootstrap only)
- **Network:** Tailscale operator, 8Gb Google Fiber

## Development Environments

Development happens across three environments:

1. **WSL2 (primary)** - Main Windows machine
2. **Mac Mini (secondary)** - Apple Silicon, local testing
3. **NixOS (server)** - Direct server access when needed

All code is version controlled in a single Git repository. Changes to `flux/clusters/` are reconciled by Flux; changes to `argocd/clusters/` are reconciled by ArgoCD.

## Repository Structure

```
sb/
├── nixos/                   # NixOS system configuration
│   ├── flake.nix           # Nix flake entry point
│   ├── configuration.nix   # Main system config
│   ├── hardware-configuration.nix
│   ├── home/               # Home-manager configs
│   └── modules/            # Modular NixOS configs
│       ├── base.nix
│       ├── k3s.nix
│       ├── docker.nix
│       ├── ssh.nix
│       ├── tailscale.nix
│       ├── firewall.nix
│       ├── zfs.nix
│       └── users.nix
│
├── flux/                    # Flux — Bootstrap Layer ONLY
│   └── clusters/
│       └── superbloom/     # Cluster-specific manifests
│           ├── flux-system/ # Flux bootstrap controllers
│           ├── infra/       # ArgoCD Helm chart
│           └── kustomization.yaml
│
├── argocd/                # ArgoCD — Primary GitOps
│   └── clusters/
│       └── superbloom/
│           ├── infra/       # Infrastructure (caddy, authelia, ddns, alloy)
│           ├── hermes/      # Hermes Agent + MCP servers
│           ├── media/       # Jellyfin, Sonarr, Radarr, etc.
│           ├── games/       # Minecraft infrastructure
│           └── data/        # Valkey, databases
│
├── hermes/                # Hermes Agent configuration
│   ├── config.yaml         # Runtime config
│   ├── SOUL.md             # Agent personality
│   └── skills/             # Built-in skills
│
├── mcp-servers/           # Standalone Python MCP servers
│   ├── mcp-k8s/
│   ├── mcp-kserve/
│   └── mcp-grafana/
│
└── .github/workflows/     # CI/CD — NixOS deploy, image builds
```

## Conventions

### Kubernetes / Flux (Bootstrap Only)

- Flux manages **only** the components ArgoCD depends on (currently just ArgoCD itself)
- Do **not** add application deployments to `flux/clusters/` — use `argocd/clusters/` instead
- See `flux/README.md` for bootstrap details

### ArgoCD (Primary GitOps)

- Infrastructure apps are under `argocd/clusters/<cluster>/infra/`
- Application deployments are under `argocd/clusters/<cluster>/<category>/`
- Each app has its own directory with `app.yaml` (ArgoCD Application CRD), `kustomization.yaml`, and optional `values.yaml`
- Use bjw-s app-template Helm chart where applicable
- Secrets use SOPS encryption + External Secrets Operator

### NixOS

- Uses Nix Flakes with Home Manager
- Modular configuration in `modules/` directory
- Rebuild command: `sudo nixos-rebuild switch --flake ./nixos#superbloom`
- Keep modules focused and single-purpose

### Hermes Agent

- Configuration lives in `hermes/` and is deployed by ArgoCD
- Edit `config.yaml` or `skills/` to change agent behavior
- ArgoCD redeploys on push to `main`

### MCP Servers

- Standalone Python tools in `mcp-servers/`
- Each exposes tools via the Model Context Protocol over stdio
- Hermes connects to them via `hermes/config.yaml`

## Common Tasks

### Adding a new Kubernetes app

**Do not use Flux.** Use ArgoCD:

1. Create directory under `argocd/clusters/superbloom/<category>/`
2. Add `app.yaml` (ArgoCD Application), `kustomization.yaml`
3. Add `values.yaml` (if Helm) or `resources/` (if raw manifests)
4. Reference in parent `kustomization.yaml`
5. Push to main — ArgoCD syncs automatically

For full instructions, see `argocd/README.md`.

### Modifying NixOS configuration

1. Edit files in `nixos/` directory
2. Test with `nixos-rebuild dry-run --flake ./nixos#superbloom`
3. Apply on server with `sudo nixos-rebuild switch --flake ./nixos#superbloom`

### Working with Hermes / MCP servers

1. Edit `hermes/config.yaml` or add a skill to `hermes/skills/`
2. Or edit MCP server code in `mcp-servers/`
3. Push to `main` — ArgoCD redeploys Hermes

## Important Notes

- **GitOps:** Changes to `argocd/clusters/` auto-deploy via ArgoCD; changes to `flux/clusters/` auto-deploy via Flux. Be careful with commits to main.
- **Secrets:** Never commit plaintext secrets; use SOPS encryption
- **Testing:** Prefer `--dry-run` flags when available before applying changes
- **Monorepo:** All components live in one repository for easier cross-layer changes
