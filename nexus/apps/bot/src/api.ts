import { treaty } from "@elysiajs/eden";
import type { App } from "@nexus/api/app";
import { config } from "./config";

export const client = treaty<App>(config.ELYSIA_API_URL, {
	headers: config.ELYSIA_API_KEY ? { Authorization: `Bearer ${config.ELYSIA_API_KEY}` } : undefined,
});

// Convenience exports
export const gameServers = client.api.gameServers;
export const health = client.health;
