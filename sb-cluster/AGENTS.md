# AGENTS.md

Guidelines for AI agents working on this homelab infrastructure.

## Project Overview

This is a NixOS-based homelab running K3s with Flux GitOps. The infrastructure spans multiple repositories that are typically developed together via the `superbloom.code-workspace`.

### Related Repositories

| Repository | Purpose |
|------------|---------|
| `sb-cluster` (this repo) | Flux GitOps manifests, Kubernetes app deployments |
| `sb-system` (`../sb-system`) | NixOS system configuration for the server |
| `sb-apps` (`../sb-apps`) | Custom container images and services |

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

All repos use Git for version control. Changes to Kubernetes manifests in `clusters/` are automatically reconciled by Flux.

## Repository Structure

```
sb-cluster/
├── clusters/
│   └── superbloom/          # Cluster-specific manifests
│       ├── flux-system/     # Flux bootstrap
│       └── apps/            # Application deployments
│           └── infra/       # Infrastructure apps (caddy, authelia, ddns)
└── AGENTS.md

sb-system/                   # NixOS config (separate repo)
├── flake.nix               # Nix flake entry point
├── configuration.nix       # Main system config
├── hardware-configuration.nix
├── home/                   # Home-manager configs
└── modules/                # Modular NixOS configs
    ├── base.nix
    ├── k3s.nix
    ├── docker.nix
    ├── ssh.nix
    ├── tailscale.nix
    ├── firewall.nix
    └── users.nix

sb-apps/                     # Container images (separate repo)
├── caddy-cloudflare/       # Caddy with Cloudflare DNS module
├── docker-discord-bot/
├── homelab-elysia/
└── .github/workflows/      # CI for building/pushing to GHCR
```

## Conventions

### Kubernetes/Flux

- Apps are organized under `clusters/<cluster>/apps/`
- Each app has its own directory with `kustomization.yaml`, `release.yaml` (HelmRelease), and optional `secrets.yaml`
- Namespaces are defined in `ns.yaml` files
- Use bjw-s app-template Helm chart where applicable
- Secrets use SOPS or sealed-secrets (check existing patterns)

### NixOS (polyphony repo)

- Uses Nix Flakes with Home Manager
- Modular configuration in `modules/` directory
- Rebuild command: `sudo nixos-rebuild switch --flake /etc/nixos#polyphony`
- Keep modules focused and single-purpose

### Container Images (homelab-images repo)

- Each image has its own directory with a `Dockerfile`
- Images auto-build on push to main via GitHub Actions
- Published to `ghcr.io/saavy1/<image-name>:latest`

## Common Tasks

### Adding a new Kubernetes app

1. Create directory under `clusters/superbloom/apps/infra/` (or appropriate category)
2. Add `ns.yaml` (namespace), `release.yaml` (HelmRelease), `kustomization.yaml`
3. Reference in parent `kustomization.yaml`
4. Commit and push - Flux will reconcile

### Modifying NixOS configuration

1. Edit files in `sb-system/` repo
2. Test with `nixos-rebuild dry-run --flake .#superbloom`
3. Apply on server with `sudo nixos-rebuild switch --flake /etc/nixos#superbloom`

### Building custom container images

1. Create/modify Dockerfile in `sb-apps/<image-name>/`
2. Push to main - GitHub Actions handles build and push to GHCR

## Important Notes

- **GitOps:** Changes to `clusters/` auto-deploy via Flux - be careful with commits to main
- **Secrets:** Never commit plaintext secrets; use SOPS encryption or sealed-secrets
- **Testing:** Prefer `--dry-run` flags when available before applying changes
- **Container registry:** Images are at `ghcr.io/saavy1/`
