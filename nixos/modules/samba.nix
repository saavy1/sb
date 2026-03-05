{ pkgs, ... }:

{
  # nmbd not needed — MagicDNS handles name resolution on tailnet
  systemd.services.samba-nmbd.enable = false;

  services.samba = {
    enable = true;
    openFirewall = false; # tailscale0 is already trusted, firewall blocks LAN

    settings = {
      global = {
        "workgroup" = "WORKGROUP";
        "server string" = "superbloom";
        "server role" = "standalone server";

        # No interface binding — smbd listens on all interfaces at startup,
        # but only tailscale0 is a trusted firewall interface so LAN clients
        # are blocked. This avoids the tailscale0 startup race entirely.

        # Performance tuning for ZFS + large files
        "socket options" = "TCP_NODELAY IPTOS_LOWDELAY";
        "use sendfile" = "yes";
        "min receivefile size" = "16384";
        "aio read size" = "16384";
        "aio write size" = "16384";

        # macOS compatibility
        "vfs objects" = "fruit streams_xattr";
        "fruit:metadata" = "stream";
        "fruit:model" = "MacSamba";
        "fruit:posix_rename" = "yes";
        "fruit:zero_file_id" = "yes";
        "fruit:nfs_aces" = "no";
        "fruit:wipe_intentionally_left_blank_rfork" = "yes";
        "fruit:delete_empty_adfiles" = "yes";

        # Disable printer sharing
        "load printers" = "no";
        "printing" = "bsd";
        "printcap name" = "/dev/null";
        "disable spoolss" = "yes";

        # Logging
        "logging" = "systemd";
        "log level" = "1";
      };

      # Movies, shows, music — read/write for saavy
      media = {
        "path" = "/tank/media";
        "browseable" = "yes";
        "read only" = "no";
        "valid users" = "saavy";
        "create mask" = "0664";
        "directory mask" = "0775";
        "force user" = "saavy";
        "force group" = "users";
      };

      # Community sharing — STLs, assets, mirrors
      public = {
        "path" = "/tank/public";
        "browseable" = "yes";
        "read only" = "no";
        "valid users" = "saavy";
        "create mask" = "0664";
        "directory mask" = "0775";
        "force user" = "saavy";
        "force group" = "users";
      };

      # Private data — datasets, large files
      data = {
        "path" = "/tank/data";
        "browseable" = "yes";
        "read only" = "no";
        "valid users" = "saavy";
        "create mask" = "0600";
        "directory mask" = "0700";
        "force user" = "saavy";
        "force group" = "users";
      };

      # Game server storage
      games = {
        "path" = "/tank/games";
        "browseable" = "yes";
        "read only" = "no";
        "valid users" = "saavy";
        "create mask" = "0664";
        "directory mask" = "0775";
        "force user" = "saavy";
        "force group" = "users";
      };

      # AI/ML models
      models = {
        "path" = "/tank/models";
        "browseable" = "yes";
        "read only" = "no";
        "valid users" = "saavy";
        "create mask" = "0664";
        "directory mask" = "0775";
        "force user" = "saavy";
        "force group" = "users";
      };

      # Datasets
      datasets = {
        "path" = "/tank/datasets";
        "browseable" = "yes";
        "read only" = "no";
        "valid users" = "saavy";
        "create mask" = "0664";
        "directory mask" = "0775";
        "force user" = "saavy";
        "force group" = "users";
      };
    };
  };

  # Samba Web Service Discovery — allows auto-discovery in file managers
  services.samba-wsdd = {
    enable = true;
    openFirewall = false; # tailscale0 is already trusted
  };
}
