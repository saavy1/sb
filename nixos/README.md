# NixOS Configuration

Declarative NixOS configuration for the Superbloom server using Nix Flakes.

## Overview

This directory contains the complete NixOS system configuration for the Superbloom homelab server. It uses Nix Flakes for reproducible builds and Home Manager for user environment management.

## Stack

- **NixOS:** 25.11
- **Home Manager:** release-25.11
- **K3s:** Lightweight Kubernetes
- **Docker:** Container runtime
- **Tailscale:** VPN mesh networking

## Directory Structure

```
nixos/
├── flake.nix                   # Flake definition and inputs
├── flake.lock                  # Pinned dependencies
├── configuration.nix           # Main system configuration
├── hardware-configuration.nix  # Hardware-specific config
├── modules/
│   ├── base.nix               # Base system packages and settings
│   ├── users.nix              # User accounts
│   ├── docker.nix             # Docker configuration
│   ├── ssh.nix                # SSH server config
│   ├── tailscale.nix          # Tailscale VPN
│   ├── k3s.nix                # K3s Kubernetes cluster
│   └── firewall.nix           # Firewall rules
└── home/
    └── saavy.nix              # Home Manager config for saavy user
```

## Usage

### Build Configuration

```bash
# Build without switching
nixos-rebuild build --flake .#superbloom

# Build and switch to new configuration
sudo nixos-rebuild switch --flake .#superbloom
```

### Update Dependencies

```bash
# Update all flake inputs
nix flake update

# Update specific input
nix flake lock --update-input nixpkgs
```

## What It Manages

- **Operating System** - Base NixOS installation and bootloader
- **K3s Cluster** - Single-node Kubernetes for running homelab apps
- **Container Runtime** - Docker for local development
- **Networking** - Tailscale VPN, firewall rules, hostname
- **Users** - System users and Home Manager configurations
- **SSH** - Secure remote access

## Related Components

- **[`../flux/`](../flux)** - Flux CD deploys apps to the K3s cluster provisioned here
- **[`../apps/`](../apps)** - Applications that run on this infrastructure
