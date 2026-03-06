# NixOS on DGX Spark / Asus Ascent GX10

Research notes on replacing DGX OS with NixOS on the Spark (GB10 unified memory, ARM64, Blackwell GPU).

## Why

- Match superbloom's declarative NixOS setup -- both nodes managed the same way
- Eliminate DGX OS cruft: GNOME desktop, snap packages, Ubuntu Pro, unattended-upgrades
- The Spark is headless (k3s + Tailscale + containerized vLLM) -- DGX OS is massive overkill
- Atomic rollbacks if a driver update breaks things
- No more `apt-get` stuck in D state eating CPU

## Current State (as of March 2026)

**Someone already did this.** [graham33/nixos-dgx-spark](https://github.com/graham33/nixos-dgx-spark) provides:

- USB installer image (boot, install, done)
- Flake template: `nix flake init -t github:graham33/nixos-dgx-spark`
- NVIDIA's custom kernel config (generated from Debian annotations, ~82% smaller than raw)
- Confirmed working on both DGX Spark and Asus Ascent GX10

Active [NixOS Discourse thread](https://discourse.nixos.org/t/nvidia-dgx-spark/71397) with users sharing experiences.

## Key Requirements

### Kernel
- **Must use NVIDIA's kernel** -- the standard NixOS kernel breaks Ethernet on the GB10
- The flake provides two boot options: NVIDIA kernel (default, works) and standard kernel (Ethernet broken)
- Kernel config is maintained in `kernel-configs/nvidia-dgx-spark-<version>.nix`

### GPU Drivers
- Blackwell requires open-source NVIDIA modules: `hardware.nvidia.open = true`
- This is mandatory for all data center GPUs from Grace Hopper / Blackwell onward
- Proprietary modules are no longer supported for this hardware class

### Secure Boot
- Must be disabled in BIOS before installing

## What We'd Lose from DGX OS

| DGX OS Feature | Impact for Us |
|----------------|---------------|
| Pre-installed CUDA drivers | None -- vLLM runs in containers with bundled CUDA runtime. Just need host nvidia driver + container toolkit |
| NVIDIA OTA updates | Replaced by `nixos-rebuild switch`, which is better (atomic, rollback) |
| DGX OS "support" | N/A for homelab |
| Ubuntu package ecosystem | Not using it -- everything is containerized |

## What We'd Gain

| Benefit | Detail |
|---------|--------|
| Declarative config | k3s, Tailscale, nvidia drivers, all in one `configuration.nix` |
| Consistency | Both cluster nodes managed identically |
| No desktop bloat | No GNOME, Firefox, snap, or GNOME-related memory pressure |
| Atomic upgrades | Roll back instantly if something breaks |
| Reproducibility | Rebuild the exact same system from a flake |

## Minimal NixOS Config (Sketch)

What our `configuration.nix` would roughly look like:

```nix
{ config, pkgs, ... }:
{
  # GPU
  hardware.nvidia.open = true;
  services.xserver.videoDrivers = [ "nvidia" ];

  # Container runtime for k3s
  virtualisation.containers.enable = true;
  hardware.nvidia-container-toolkit.enable = true;

  # k3s agent (joins superbloom control plane)
  services.k3s = {
    enable = true;
    role = "agent";
    serverAddr = "https://100.66.91.56:6443";
    extraFlags = "--flannel-iface=tailscale0";
  };

  # Tailscale
  services.tailscale.enable = true;

  # Headless
  boot.loader.systemd-boot.enable = true;
  services.openssh.enable = true;

  # No desktop
  # (nothing to disable -- just don't enable it)
}
```

## Migration Plan

1. Back up any state on spark (k3s token, Tailscale auth, model weights path)
2. Build USB image from the flake: `nix build .#image`
3. Disable Secure Boot in BIOS
4. Boot from USB, install NixOS
5. Configure k3s agent to rejoin the cluster
6. Verify GPU detection: `nvidia-smi`, `kubectl get nodes` shows GPU allocatable
7. Redeploy workloads (kserve InferenceService, GPU operator daemonsets)

## Open Questions

- How well does the NVIDIA kernel track upstream? Are we stuck on a specific version?
- Does `nixos-hardware` plan to upstream DGX Spark support, or will it stay in graham33's repo?
- Any issues with the GPU Operator DaemonSets on NixOS (container toolkit paths, device plugin)?
- Performance impact of open-source vs proprietary drivers on Blackwell (likely none for inference)

## References

- [graham33/nixos-dgx-spark](https://github.com/graham33/nixos-dgx-spark)
- [NixOS Discourse - Nvidia DGX Spark](https://discourse.nixos.org/t/nvidia-dgx-spark/71397)
- [NixOS Wiki - NVIDIA](https://wiki.nixos.org/wiki/Nvidia)
- [NVIDIA DGX Spark User Guide](https://docs.nvidia.com/dgx/dgx-spark/dgx-os.html)
- [NVIDIA Forums - Alternative Linux distro](https://forums.developer.nvidia.com/t/has-anyone-tried-an-alternative-linux-distro/349124)
- [NVIDIA Forums - Can DGX Spark install 2nd OS?](https://forums.developer.nvidia.com/t/can-dgx-spark-install-2nd-os/346812)
