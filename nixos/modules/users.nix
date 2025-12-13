{ pkgs, ... }:

{
  users.users.saavy = {
    isNormalUser = true;
    description = "saavy";
    extraGroups = [ "networkmanager" "wheel" "docker" ];
    packages = with pkgs; [ ];
    shell = pkgs.zsh;
  };
}
