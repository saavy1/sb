import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	out: "./db/migrations",
	// We have multiple databases, so we generate migrations separately
	// Run: bun drizzle-kit generate --schema=./src/domains/game-servers/schema.ts --out=./db/migrations/minecraft
	// Run: bun drizzle-kit generate --schema=./src/domains/core/schema.ts --out=./db/migrations/core
});
