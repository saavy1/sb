{ config, pkgs, ... }:

{
  # ZFS support
  boot.supportedFilesystems = [ "zfs" ];
  boot.zfs.forceImportRoot = false;
  boot.zfs.forceImportAll = false;

  # Use LTS kernel for ZFS compatibility
  boot.kernelPackages = pkgs.linuxPackages;

  # ZFS utilities
  environment.systemPackages = with pkgs; [ zfs ];

  # Auto-scrub monthly
  services.zfs.autoScrub = {
    enable = true;
    interval = "monthly";
    pools = [ "tank" ];
  };

  # Auto-snapshots (enable when ready)
  # services.zfs.autoSnapshot = {
  #   enable = true;
  #   frequent = 4;   # 15-min, keep 4
  #   hourly = 24;
  #   daily = 7;
  #   weekly = 4;
  #   monthly = 12;
  # };

  # ZFS ARC tuning (64GB RAM = ~32GB ARC by default)
  boot.kernel.sysctl = {
    "vm.swappiness" = 10;
  };
}
