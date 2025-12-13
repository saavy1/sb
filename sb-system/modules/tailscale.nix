{
  services.tailscale = {
    enable = true;
    useRoutingFeatures = "server";
  };

  networking.firewall.trustedInterfaces = [ "tailscale0" ];
}
