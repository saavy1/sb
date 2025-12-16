import { join } from "node:path";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import logger from "logger";
import postgres from "postgres";
import { config } from "./config";

// === Postgres migrations (all schemas) ===

if (!config.DATABASE_URL) {
	logger.error("DATABASE_URL is required for Postgres migrations");
	process.exit(1);
}

const pgClient = postgres(config.DATABASE_URL, { max: 1 });
const pgDb = drizzlePostgres(pgClient);

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
		await migratePostgres(pgDb, {
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

await pgClient.end();

logger.info("All migrations complete");
