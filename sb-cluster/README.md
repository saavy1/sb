# Homelab Infrastructure

Declarative NixOS-based homelab running K3s with Flux GitOps for all application deployments.

## Overview

This repository contains the NixOS system configuration for a homelab server transitioning from Ubuntu/MicroK8s to a fully declarative infrastructure-as-code setup.

### Hardware

- **CPU:** AMD Ryzen 7 5700G
- **RAM:** 64GB DDR4
- **Storage:** 
  - 2TB NVMe (OS/cache/games)
  - 20TB ZFS pool (expanding to ~10 disks in ZFS2)
- **GPU:** Intel Arc A380 (transcode)
- **Case:** Jonsbo N3
- **Network:** 8Gb Google Fiber, 2.5Gb local switch

### Stack

- **OS:** NixOS (declarative configuration)
- **Orchestration:** K3s
- **GitOps:** Flux CD
- **Storage:** ZFS
- **Applications:** Deployed via separate [homelab-apps](https://github.com/username/homelab-apps) repository

## Architecture

```
┌─────────────────────────────────────────┐
│          NixOS System Config            │
│  (this repo)                            │
│  ├─ K3s installation & config           │
│  ├─ ZFS pool management                 │
│  ├─ Network configuration               │
│  └─ Base system packages                │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│         K3s + Flux GitOps               │
│  Watches homelab-apps repo              │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│          Application Workloads          │
│  (homelab-apps repo)                    │
│  ├─ Media stack (Jellyfin, *arr)        │
│  ├─ Game servers (MC, Satisfactory)     │
│  ├─ Infrastructure (Auth, DNS, etc)     │
│  └─ Self-hosted apps                    │
└─────────────────────────────────────────┘
```

## Repository Structure

```
.
├── flake.nix              # Nix flake definition
├── flake.lock             # Locked dependencies
├── configuration.nix      # Main system configuration
├── hardware-configuration.nix
├── modules/
│   ├── k3s.nix           # K3s setup
│   ├── zfs.nix           # ZFS pool configuration
│   ├── networking.nix    # Network config
│   └── users.nix         # User management
└── README.md
```

## Quick Start

### Initial Deployment

```bash
# Clone the repository
git clone https://github.com/username/homelab-nixos.git /etc/nixos

# Build and switch to the new configuration
sudo nixos-rebuild switch --flake /etc/nixos#hostname
```

### Updates

```bash
# Update flake inputs
nix flake update

# Apply changes
sudo nixos-rebuild switch --flake /etc/nixos#hostname
```

## Migration Status

This is an active migration from:
- **From:** Ubuntu 22.04 + MicroK8s + scattered Docker
- **To:** NixOS + K3s + Flux GitOps

### Completed
- [x] Base NixOS installation
- [ ] K3s installation via Nix
- [ ] ZFS pool configuration
- [ ] Flux GitOps bootstrap
- [ ] Application migration (tracked in homelab-apps repo)

## Related Repositories

- **[homelab-apps](https://github.com/username/homelab-apps):** Kubernetes manifests and Helm charts for all applications
- **Container Images:** Published to GHCR from individual application repositories

## Future Plans

- Hardware split: Separate compute (K3s + apps) and storage (pure NAS) nodes
- Full ZFS2 pool with ~10 disks
- CI/CD pipelines for all custom container images
- Zero on-device development (all via GitOps)

## License

MIT

---

**Project Description** (for Claude or GitHub About section):

```
NixOS-based homelab infrastructure with K3s and Flux GitOps. Declarative system configuration for a media server, game hosting, and self-hosted applications. Running Jellyfin (Arc A380 transcode), *arr stack, game servers (Minecraft, Satisfactory, Necesse, Terraria), and various self-hosted services. Migrating from Ubuntu/MicroK8s to fully reproducible infrastructure-as-code.
```