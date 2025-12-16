import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/domains/game-servers/schema.ts",
	out: "./drizzle/game-servers-pg/migrations",
	dbCredentials: {
		url: process.env.DATABASE_URL || "postgres://nexus:nexus@localhost:5432/nexus",
	},
});
