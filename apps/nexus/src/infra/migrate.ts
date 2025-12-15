import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import logger from "logger";
import { config } from "./config";

const dbPath = config.DB_PATH;

// Ensure db directory exists
mkdirSync(dbPath, { recursive: true });

// Domain configurations: maps domain name to database file and migrations folder
const domains = [
	{ name: "agent", dbFile: "agent.sqlite", migrationsFolder: "agent" },
	{ name: "apps", dbFile: "apps.sqlite", migrationsFolder: "apps" },
	{ name: "core", dbFile: "core.sqlite", migrationsFolder: "core" },
	{ name: "game-servers", dbFile: "minecraft.sqlite", migrationsFolder: "game-servers" },
	{ name: "ops", dbFile: "ops.sqlite", migrationsFolder: "ops" },
	{ name: "system-info", dbFile: "system-info.sqlite", migrationsFolder: "system-info" },
] as const;

// Run migrations for all domains
for (const domain of domains) {
	logger.info({ database: domain.name }, "Running migrations");

	const sqlite = new Database(join(dbPath, domain.dbFile), { create: true });
	sqlite.exec("PRAGMA journal_mode = WAL;");
	const db = drizzle(sqlite);

	try {
		migrate(db, {
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
		// "No migrations found" is expected for new domains without migrations yet
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
