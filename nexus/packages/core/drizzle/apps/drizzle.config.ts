import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	schema: "./src/domains/apps/schema.ts",
	out: "./drizzle/apps/migrations",
	dbCredentials: {
		url: "./db/apps.sqlite",
	},
});
