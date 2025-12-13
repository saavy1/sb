{
  networking.firewall = {
    allowedTCPPorts = [
      80
      443
      25565
    ];

    allowedUDPPorts = [ ];
  };
}
