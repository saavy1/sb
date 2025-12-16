import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/domains/system-info/schema.ts",
	out: "./drizzle/system-info-pg/migrations",
	dbCredentials: {
		url: process.env.DATABASE_URL || "postgres://nexus:nexus@localhost:5432/nexus",
	},
});
