import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	schema: "./src/domains/core/schema.ts",
	out: "./drizzle/core/migrations",
	dbCredentials: {
		url: "./db/core.sqlite",
	},
});
