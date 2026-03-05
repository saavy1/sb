{ pkgs, ... }:

{
  # Gate service: blocks until tailscale0 has an IPv4 address.
  # tailscaled.service reports ready before the TUN is bindable
  # (tailscale/tailscale#11504), so After= alone isn't enough.
  systemd.services.tailscale-online = {
    description = "Wait for Tailscale interface to be ready";
    after = [ "tailscaled.service" ];
    wants = [ "tailscaled.service" ];
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
      ExecStart = pkgs.writeShellScript "wait-for-tailscale" ''
        for i in $(seq 1 30); do
          if ${pkgs.iproute2}/bin/ip -4 addr show dev tailscale0 | ${pkgs.gnugrep}/bin/grep -q 'inet '; then
            echo "tailscale0 has an IPv4 address"
            exit 0
          fi
          echo "Waiting for tailscale0 IPv4 address... ($i/30)"
          sleep 1
        done
        echo "ERROR: tailscale0 did not get an IPv4 address within 30s"
        exit 1
      '';
    };
  };

  # Samba waits for the tailscale gate, not just tailscaled
  systemd.services.samba-smbd = {
    after = [ "tailscale-online.service" ];
    wants = [ "tailscale-online.service" ];
  };

  # nmbd not needed — MagicDNS handles name resolution on tailnet
  systemd.services.samba-nmbd.enable = false;

  # WSDD also needs the interface up
  systemd.services.samba-wsdd = {
    after = [ "tailscale-online.service" ];
    wants = [ "tailscale-online.service" ];
  };

  services.samba = {
    enable = true;
    openFirewall = false; # tailscale0 is already trusted

    settings = {
      global = {
        "workgroup" = "WORKGROUP";
        "server string" = "superbloom";
        "server role" = "standalone server";

        # Security — only accessible over Tailscale
        "interfaces" = "tailscale0";
        "bind interfaces only" = "yes";

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
    interface = "tailscale0";
  };
}
