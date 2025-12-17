{ config, pkgs, lib, ... }:

{
  # ZFS kernel module and utilities
  boot.supportedFilesystems = [ "zfs" ];
  boot.zfs.forceImportRoot = false;
  boot.zfs.forceImportAll = false;

  # Don't use latest kernel if ZFS doesn't support it yet
  boot.kernelPackages = config.boot.zfs.package.latestCompatibleLinuxPackages;

  # ZFS auto-scrubbing (monthly by default)
  services.zfs.autoScrub = {
    enable = true;
    interval = "monthly";
    pools = [ "tank" ];
  };

  # ZFS auto-snapshot (optional - commented out by default)
  # services.zfs.autoSnapshot = {
  #   enable = true;
  #   frequent = 4;  # 15-minute snapshots, keep 4
  #   hourly = 24;   # hourly snapshots, keep 24
  #   daily = 7;     # daily snapshots, keep 7
  #   weekly = 4;    # weekly snapshots, keep 4
  #   monthly = 12;  # monthly snapshots, keep 12
  # };

  # ZFS TRIM support for SSDs (if applicable)
  services.zfs.trim = {
    enable = false;  # Set to true if using SSDs
    interval = "weekly";
  };

  # Install ZFS utilities
  environment.systemPackages = with pkgs; [
    zfs
    zpool-iostat
  ];

  # Networking configuration for NFS over Tailscale
  networking.firewall = {
    # NFS ports - only accessible via Tailscale (trusted interface)
    allowedTCPPorts = [ 2049 ];  # NFS
    allowedUDPPorts = [ 2049 ];  # NFS
  };

  # NFS server configuration
  services.nfs.server = {
    enable = true;

    # Export ZFS datasets over Tailscale only
    # Tailscale subnet is typically 100.64.0.0/10
    exports = ''
      /tank/data    100.0.0.0/8(rw,sync,no_subtree_check,no_root_squash)
      /tank/backups 100.0.0.0/8(rw,sync,no_subtree_check,no_root_squash)
      /tank/media   100.0.0.0/8(rw,sync,no_subtree_check,no_root_squash)
    '';
  };

  # Samba/SMB server configuration (alternative to NFS)
  # Uncomment to enable SMB shares
  # services.samba = {
  #   enable = true;
  #   securityType = "user";
  #   openFirewall = true;  # Will only open on trusted Tailscale interface
  #
  #   extraConfig = ''
  #     workgroup = WORKGROUP
  #     server string = Superbloom NAS
  #     netbios name = superbloom
  #     security = user
  #     hosts allow = 100. localhost
  #     hosts deny = 0.0.0.0/0
  #     guest account = nobody
  #     map to guest = bad user
  #   '';
  #
  #   shares = {
  #     data = {
  #       path = "/tank/data";
  #       browseable = "yes";
  #       "read only" = "no";
  #       "guest ok" = "no";
  #       "create mask" = "0644";
  #       "directory mask" = "0755";
  #     };
  #     backups = {
  #       path = "/tank/backups";
  #       browseable = "yes";
  #       "read only" = "no";
  #       "guest ok" = "no";
  #     };
  #     media = {
  #       path = "/tank/media";
  #       browseable = "yes";
  #       "read only" = "no";
  #       "guest ok" = "no";
  #     };
  #   };
  # };

  # System tuning for ZFS
  boot.kernel.sysctl = {
    # Adjust ARC size (ZFS cache)
    # Default is 50% of RAM, adjust as needed
    # "vm.swappiness" = 1;  # Prefer using ZFS ARC over swap
  };

  # Ensure ZFS pool is imported on boot
  systemd.services.zfs-import-tank = {
    description = "Import ZFS pool 'tank'";
    wantedBy = [ "multi-user.target" ];
    after = [ "systemd-udev-settle.service" ];
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
      ExecStart = "${pkgs.zfs}/bin/zpool import -f tank";
      ExecStartPost = "${pkgs.coreutils}/bin/sleep 2";
    };
  };
}
