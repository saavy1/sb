import { join } from "node:path";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import logger from "@nexus/logger";
import { config } from "./config";

// === Postgres migrations (all schemas) ===

if (!config.DATABASE_URL) {
	logger.error("DATABASE_URL is required for Postgres migrations");
	process.exit(1);
}

const pgClient = new SQL(config.DATABASE_URL);
const pgDb = drizzle(pgClient);

const postgresSchemas = [
	{ name: "agent", migrationsFolder: "agent" },
	{ name: "apps", migrationsFolder: "apps-pg" },
	{ name: "core", migrationsFolder: "core-pg" },
	{ name: "game-servers", migrationsFolder: "game-servers-pg" },
	{ name: "ops", migrationsFolder: "ops-pg" },
	{ name: "system-info", migrationsFolder: "system-info-pg" },
] as const;

for (const schema of postgresSchemas) {
	logger.info({ database: schema.name }, "Running Postgres migrations");

	try {
		await migrate(pgDb, {
			migrationsFolder: join(
				import.meta.dir,
				"../../drizzle",
				schema.migrationsFolder,
				"migrations"
			),
		});
		logger.info({ database: schema.name }, "Postgres migrations complete");
	} catch (e) {
		const error = e as Error;
		if (error.message?.includes("No config.json found")) {
			logger.info({ database: schema.name }, "No migrations found, skipping");
		} else {
			logger.error({ database: schema.name, error: error.message }, "Postgres migration failed");
			throw e;
		}
	}
}

pgClient.close();

logger.info("All migrations complete");
