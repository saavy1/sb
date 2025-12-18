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

	// Grafana webhook for alerts
	GRAFANA_WEBHOOK_TOKEN: Bun.env.GRAFANA_WEBHOOK_TOKEN,

	// AI / OpenRouter
	OPENROUTER_API_KEY: Bun.env.OPENROUTER_API_KEY,
	AI_MODEL: Bun.env.AI_MODEL || "deepseek/deepseek-v3.2",
	AI_MODELS: Bun.env.AI_MODELS, // Additional models (format: "id:name:provider,id:name:provider")

	// OpenAI (for embeddings)
	OPENAI_API_KEY: Bun.env.OPENAI_API_KEY,
	EMBEDDING_MODEL: Bun.env.EMBEDDING_MODEL || "text-embedding-3-small",

	// Valkey (Redis-compatible) for BullMQ queues
	VALKEY_URL: Bun.env.VALKEY_URL || "redis://localhost:6379",

	// Qdrant (vector database) for embeddings
	QDRANT_URL: Bun.env.QDRANT_URL || "http://localhost:6333",
} as const;

export const isDev = config.NODE_ENV === "development";
export const isProd = config.NODE_ENV === "production";
