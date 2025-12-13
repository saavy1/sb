{
  services.k3s = {
    enable = true;
    role = "server";
    extraFlags = [
      "--disable=traefik"
    ];
  };
}
