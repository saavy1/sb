# AGENTS.md

Guidelines for AI agents working on this homelab infrastructure.

## Project Overview

This is a NixOS-based homelab running K3s with Flux GitOps. The infrastructure is organized as a monorepo with three main components.

### Monorepo Structure

| Directory | Purpose |
|-----------|---------|
| `nixos/` | NixOS system configuration for the Superbloom server |
| `flux/` | Flux GitOps manifests, Kubernetes app deployments |
| `apps/` | Custom application services (Bun workspace) |

### Server: Superbloom

- **OS:** NixOS (nixos-25.11)
- **Hardware:** AMD Ryzen 7 5700G, 64GB RAM, Intel Arc A380 (transcode), ZFS storage
- **Orchestration:** K3s
- **GitOps:** Flux CD
- **Network:** Tailscale, 8Gb Google Fiber

## Development Environments

Development happens across three environments:

1. **WSL2 (primary)** - Main Windows machine
2. **Fedora (secondary)** - Laptop
3. **NixOS (server)** - Direct server access when needed

All code is version controlled in a single Git repository. Changes to Kubernetes manifests in `flux/clusters/` are automatically reconciled by Flux.

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
│       └── users.nix
│
├── flux/                    # Flux GitOps
│   └── clusters/
│       └── superbloom/     # Cluster-specific manifests
│           ├── flux-system/ # Flux bootstrap
│           └── apps/       # Application deployments
│               └── infra/  # Infrastructure apps (caddy, authelia, ddns)
│
├── apps/                    # Bun workspace for custom applications
│   ├── nexus/              # Elysia API control plane
│   ├── the-machine/        # Discord bot for game server management
│   ├── dashboard/          # React web dashboard
│   └── package.json        # Workspace root
│
└── .github/workflows/       # CI/CD for building and pushing to GHCR
    ├── nexus.yml
    ├── the-machine.yml
    └── dashboard.yml
```

## Application Architecture

### Nexus
The core Elysia API control plane providing multi-domain backend services:
- Multiple SQLite databases (one per domain)
- Domain-driven architecture (game-servers, launcher, etc.)
- Kubernetes integration for dynamic workload management
- OpenAPI/Swagger documentation

### The Machine
Discord bot for managing game servers. Thin client consuming the game-servers domain from Nexus via Eden Treaty (type-safe RPC).

### Dashboard
React web dashboard consuming multiple domains from Nexus API. Built with TanStack Router, Tailwind CSS, and Vite.

## Conventions

### Kubernetes/Flux

- Apps are organized under `flux/clusters/<cluster>/apps/`
- Each app has its own directory with `kustomization.yaml`, `release.yaml` (HelmRelease), and optional `secrets.yaml`
- Namespaces are defined in `ns.yaml` files
- Use bjw-s app-template Helm chart where applicable
- Secrets use SOPS encryption

### NixOS

- Uses Nix Flakes with Home Manager
- Modular configuration in `modules/` directory
- Rebuild command: `sudo nixos-rebuild switch --flake ./nixos#superbloom`
- Keep modules focused and single-purpose

### Applications (Bun Workspace)

- Each app is a workspace package in `apps/`
- TypeScript with strict type checking
- Bun for runtime and package management
- Images auto-build on push to main via GitHub Actions
- Published to `ghcr.io/saavy1/<image-name>:latest`

## Common Tasks

### Adding a new Kubernetes app

1. Create directory under `flux/clusters/superbloom/apps/infra/` (or appropriate category)
2. Add `ns.yaml` (namespace), `release.yaml` (HelmRelease), `kustomization.yaml`
3. Reference in parent `kustomization.yaml`
4. Commit and push - Flux will reconcile

### Modifying NixOS configuration

1. Edit files in `nixos/` directory
2. Test with `nixos-rebuild dry-run --flake ./nixos#superbloom`
3. Apply on server with `sudo nixos-rebuild switch --flake ./nixos#superbloom`

### Working with applications

1. Navigate to `apps/` directory
2. `bun install` to install dependencies
3. `bun run dev:api`, `bun run dev:bot`, or `bun run dev:dashboard`
4. Push to main - GitHub Actions handles build and push to GHCR

## Important Notes

- **GitOps:** Changes to `flux/clusters/` auto-deploy via Flux - be careful with commits to main
- **Secrets:** Never commit plaintext secrets; use SOPS encryption
- **Testing:** Prefer `--dry-run` flags when available before applying changes
- **Container registry:** Images are at `ghcr.io/saavy1/`
- **Monorepo:** All three components live in one repository for easier cross-layer changes
