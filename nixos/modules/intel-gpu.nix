{ pkgs, ... }:

{
  # Intel Arc GPU support
  boot.initrd.kernelModules = [ "i915" ];

  # Enable hardware acceleration
  hardware.graphics = {
    enable = true;
    extraPackages = with pkgs; [
      intel-media-driver  # For newer Intel GPUs (Arc, etc.)
      intel-compute-runtime  # OpenCL support
    ];
  };

  # Intel GPU monitoring tools
  environment.systemPackages = with pkgs; [
    intel-gpu-tools  # Provides intel_gpu_top
  ];
}
