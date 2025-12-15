import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { drizzle as drizzleSqlite } from "drizzle-orm/bun-sqlite";
import { migrate as migrateSqlite } from "drizzle-orm/bun-sqlite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import logger from "logger";
import postgres from "postgres";
import { config } from "./config";

const dbPath = config.DB_PATH;

// Ensure db directory exists
mkdirSync(dbPath, { recursive: true });

// === Postgres migrations (multiple schemas) ===

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

// === SQLite migrations (to be migrated to Postgres) ===

const sqliteDomains = [
	{ name: "game-servers", dbFile: "minecraft.sqlite", migrationsFolder: "game-servers" },
	{ name: "ops", dbFile: "ops.sqlite", migrationsFolder: "ops" },
	{ name: "system-info", dbFile: "system-info.sqlite", migrationsFolder: "system-info" },
] as const;

for (const domain of sqliteDomains) {
	logger.info({ database: domain.name }, "Running SQLite migrations");

	const sqlite = new Database(join(dbPath, domain.dbFile), { create: true });
	sqlite.exec("PRAGMA journal_mode = WAL;");
	const db = drizzleSqlite(sqlite);

	try {
		migrateSqlite(db, {
			migrationsFolder: join(
				import.meta.dir,
				"../../drizzle",
				domain.migrationsFolder,
				"migrations"
			),
		});
		logger.info({ database: domain.name }, "Migrations complete");
	} catch (e) {
		const error = e as Error;
		if (error.message?.includes("No config.json found")) {
			logger.info({ database: domain.name }, "No migrations found, skipping");
		} else {
			logger.error({ database: domain.name, error: error.message }, "Migration failed");
			throw e;
		}
	} finally {
		sqlite.close();
	}
}

logger.info("All migrations complete");
