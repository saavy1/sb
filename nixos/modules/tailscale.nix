{
  services.tailscale = {
    enable = true;
    useRoutingFeatures = "server";
    extraUpFlags = [ "--ssh" ];
    extraDaemonFlags = [ "--no-logs-no-support" "--state=/var/lib/tailscale/tailscaled.state" "--tun=tailscale0" "--encrypt-state=false" ];
  };


  networking.firewall.trustedInterfaces = [ "tailscale0" ];
}
