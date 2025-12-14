{ config, pkgs, ... }:

{
  imports =
    [ # Include the results of the hardware scan.
      ./hardware-configuration.nix

      ./modules/base.nix
      ./modules/users.nix
      ./modules/docker.nix
      ./modules/ssh.nix
      ./modules/tailscale.nix
      ./modules/k3s.nix
      ./modules/firewall.nix
      ./modules/intel-gpu.nix
    ];

  # Bootloader.
  boot.loader.grub.enable = true;
  boot.loader.grub.device = "/dev/nvme0n1";
  boot.loader.grub.useOSProber = true;

  networking.hostName = "superbloom"; # Define your hostname.
}
