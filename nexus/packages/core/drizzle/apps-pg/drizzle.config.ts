import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/domains/apps/schema.ts",
	out: "./drizzle/apps-pg/migrations",
	dbCredentials: {
		url: process.env.DATABASE_URL || "postgres://nexus:nexus@localhost:5432/nexus",
	},
});
