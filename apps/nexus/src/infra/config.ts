export const config = {
	PORT: Number(process.env.PORT) || 3000,
	NODE_ENV: process.env.NODE_ENV || "development",

	// Database paths
	DB_PATH: process.env.DB_PATH || "./db",

	// Internal API key for K8s svc-to-svc communication
	INTERNAL_API_KEY: process.env.INTERNAL_API_KEY,

	// Kubernetes
	K8S_NAMESPACE: process.env.K8S_NAMESPACE || "game-servers",
	K8S_IN_CLUSTER: process.env.KUBERNETES_SERVICE_HOST !== undefined,

	// Minecraft defaults
	MC_DEFAULT_MEMORY: process.env.MC_DEFAULT_MEMORY || "8Gi",
	MC_DEFAULT_PORT: Number(process.env.MC_DEFAULT_PORT) || 25565,
	MC_STORAGE_CLASS: process.env.MC_STORAGE_CLASS || "local-path",
	MC_STORAGE_SIZE: process.env.MC_STORAGE_SIZE || "50Gi",

	// CurseForge API (for modpack metadata)
	CURSEFORGE_API_KEY: process.env.CURSEFORGE_API_KEY,
} as const;

export const isDev = config.NODE_ENV === "development";
export const isProd = config.NODE_ENV === "production";
