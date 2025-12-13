import { configSchema } from "./schemas/config";

export const config = configSchema.parse({
	DISCORD_TOKEN: process.env.DISCORD_TOKEN,
	DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
	ELYSIA_API_URL: process.env.ELYSIA_API_URL,
	ELYSIA_API_KEY: process.env.ELYSIA_API_KEY,
});
