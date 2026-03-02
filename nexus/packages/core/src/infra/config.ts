export const config = {
  PORT: Number(Bun.env.PORT) || 3000,
  NODE_ENV: Bun.env.NODE_ENV || "development",

  // Database
  DB_PATH: Bun.env.DB_PATH || "./db", // SQLite databases (ops, game-servers, etc.)
  DATABASE_URL: Bun.env.DATABASE_URL, // Postgres for agent state

  // Internal API key for K8s svc-to-svc communication
  INTERNAL_API_KEY: Bun.env.INTERNAL_API_KEY,

  // Kubernetes
  K8S_NAMESPACE: Bun.env.K8S_NAMESPACE || "game-servers",
  K8S_IN_CLUSTER: Bun.env.KUBERNETES_SERVICE_HOST !== undefined,

  // Minecraft defaults
  MC_DEFAULT_MEMORY: Bun.env.MC_DEFAULT_MEMORY || "8Gi",
  MC_DEFAULT_PORT: Number(Bun.env.MC_DEFAULT_PORT) || 25565,
  MC_STORAGE_CLASS: Bun.env.MC_STORAGE_CLASS || "local-path",
  MC_STORAGE_SIZE: Bun.env.MC_STORAGE_SIZE || "50Gi",
  MC_LOADBALANCER_HOST: Bun.env.MC_LOADBALANCER_HOST || "192.168.0.8",

  // CurseForge API (for modpack metadata)
  CURSEFORGE_API_KEY: Bun.env.CURSEFORGE_API_KEY,

  // Ops / Infrastructure automation (uses Tailscale SSH - no keys needed)
  OPS_SSH_HOST: Bun.env.OPS_SSH_HOST || "superbloom",
  OPS_SSH_USER: Bun.env.OPS_SSH_USER || "root",
  OPS_FLAKE_PATH: Bun.env.OPS_FLAKE_PATH || "/home/saavy/dev/sb",
  OPS_FLAKE_TARGET: Bun.env.OPS_FLAKE_TARGET || "superbloom",
  GITHUB_WEBHOOK_SECRET: Bun.env.GITHUB_WEBHOOK_SECRET,
  GITHUB_REPO: Bun.env.GITHUB_REPO || "saavy1/sb",
  OTEL_EXPORTER_OTLP_ENDPOINT: Bun.env.OTEL_EXPORTER_OTLP_ENDPOINT,

  // Grafana webhook for alerts
  GRAFANA_WEBHOOK_TOKEN: Bun.env.GRAFANA_WEBHOOK_TOKEN,

  // Grafana API (for alert management)
  GRAFANA_URL:
    Bun.env.GRAFANA_URL ||
    "http://kube-prometheus-stack-grafana.monitoring.svc.cluster.local",
  GRAFANA_API_KEY: Bun.env.GRAFANA_API_KEY,

  // AI / OpenRouter
  OPENROUTER_API_KEY: Bun.env.OPENROUTER_API_KEY,
  AI_MODEL: Bun.env.AI_MODEL || "deepseek/deepseek-v3.2",
  AI_MODELS: Bun.env.AI_MODELS, // Additional models (format: "id:name:provider,id:name:provider")

  // Valkey (Redis-compatible) for BullMQ queues
  VALKEY_URL: Bun.env.VALKEY_URL || "redis://localhost:6379",

  // Media services (Jellyseerr)
  JELLYSEERR_URL:
    Bun.env.JELLYSEERR_URL ||
    "http://jellyseerr.jellyseerr.svc.cluster.local:5055",
  JELLYSEERR_API_KEY: Bun.env.JELLYSEERR_API_KEY,

  // Media services (SABnzbd)
  SABNZBD_URL:
    Bun.env.SABNZBD_URL || "http://sabnzbd.sabnzbd.svc.cluster.local:8080",
  SABNZBD_API_KEY: Bun.env.SABNZBD_API_KEY,

  // Loki (log aggregation)
  LOKI_URL:
    Bun.env.LOKI_URL || "http://loki-gateway.monitoring.svc.cluster.local:80",

  // Infisical (secret management)
  INFISICAL_URL:
    Bun.env.INFISICAL_URL ||
    "http://infisical.infisical.svc.cluster.local:8080",
  INFISICAL_API_TOKEN: Bun.env.INFISICAL_API_TOKEN,

  // MCP servers
  // Enabled when the corresponding secret is available (falls back to existing keys from nexus-env).
  // The tokens are used as enablement flags — MCP servers handle their own backend auth.
  MCP_GRAFANA_URL:
    Bun.env.MCP_GRAFANA_URL ||
    "http://mcp-grafana.nexus.svc.cluster.local:8000/mcp",
  MCP_GRAFANA_TOKEN: Bun.env.MCP_GRAFANA_TOKEN || Bun.env.GRAFANA_API_KEY,
  MCP_GITHUB_URL:
    Bun.env.MCP_GITHUB_URL ||
    "http://mcp-github.nexus.svc.cluster.local:8000/mcp",
  MCP_GITHUB_TOKEN: Bun.env.MCP_GITHUB_TOKEN || Bun.env.GITHUB_PAT,
  MCP_K8S_URL:
    Bun.env.MCP_K8S_URL ||
    "http://mcp-k8s.nexus.svc.cluster.local:8000/mcp",
  // Auto-enabled in-cluster; set MCP_K8S_ENABLED=true to enable externally
  MCP_K8S_ENABLED:
    Bun.env.MCP_K8S_ENABLED || (Bun.env.KUBERNETES_SERVICE_HOST ? "true" : ""),
} as const;

export const isDev = config.NODE_ENV === "development";
export const isProd = config.NODE_ENV === "production";
