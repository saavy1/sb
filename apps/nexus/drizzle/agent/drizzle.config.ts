import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	schema: "./src/domains/agent/schema.ts",
	out: "./drizzle/agent/migrations",
	dbCredentials: {
		url: "./db/agent.sqlite",
	},
});
