import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	schema: "./src/domains/ops/schema.ts",
	out: "./drizzle/ops/migrations",
	dbCredentials: {
		url: "./db/ops.sqlite",
	},
});
