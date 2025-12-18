{ pkgs, ... }:

{
  home.username = "saavy";
  home.homeDirectory = "/home/saavy";
  home.stateVersion = "25.11";

  home.sessionVariables = {
    KUBECONFIG = "/etc/rancher/k3s/k3s.yaml";
  };

  home.packages = with pkgs; [
    eza
    fd
    fzf
    git
    k9s
    kubectl
    kubernetes-helm
    ripgrep
    tmux
  ];

  programs.home-manager.enable = true;

  programs.fzf = {
    enable = true;
    enableZshIntegration = true;
  };

  programs.zsh = {
    enable = true;
    enableCompletion = true;

    autosuggestion.enable = true;

    shellAliases = {
      ls = "eza";
      ll = "eza -lh";
      la = "eza -lah";
      tree = "eza --tree";

      fr = "flux reconcile kustomization flux-system -n flux-system --with-source";
      krr = "kubectl rollout restart deployment -n";
      nr = "nixos-rebuild switch --flake .#superbloom";
      nrs = "nixos-rebuild switch --flake .#superbloom --fast";
    };

    oh-my-zsh = {
      enable = true;
      plugins = [ "git" "kubectl" "helm" ];
      theme = "robbyrussell";
    };
  };
}
