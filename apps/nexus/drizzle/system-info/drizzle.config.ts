import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	schema: "./src/domains/system-info/schema.ts",
	out: "./drizzle/system-info/migrations",
	dbCredentials: {
		url: "./db/system-info.sqlite",
	},
});
