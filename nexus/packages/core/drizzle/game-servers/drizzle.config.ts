import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	schema: "./src/domains/game-servers/schema.ts",
	out: "./drizzle/game-servers/migrations",
	dbCredentials: {
		url: "./db/minecraft.sqlite",
	},
});
