{
  services.openssh = {
    enable = true;
    listenAddresses = [
      {
        addr = "100.66.91.56";
        port = 22;
      }
    ];
  };
}
