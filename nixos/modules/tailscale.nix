{
  services.tailscale = {
    enable = true;
    useRoutingFeatures = "server";
    extraUpFlags = [ "--ssh" ];
    extraDaemonFlags = [ "--no-logs-no-support" "--state=/var/lib/tailscale/tailscaled.state" "--tun=tailscale0" ];
  };

  # Disable TPM-based state encryption to prevent DA lockout crashes
  systemd.services.tailscaled.environment.TS_USE_TPM = "false";

  networking.firewall.trustedInterfaces = [ "tailscale0" ];
}
