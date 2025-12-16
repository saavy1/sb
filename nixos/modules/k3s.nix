{
  services.k3s = {
    enable = true;
    role = "server";
    extraFlags = [
      "--disable=traefik"
      "--write-kubeconfig-mode=644"
      "--tls-san=100.66.91.56"
    ];
  };
}
