import { Database } from "bun:sqlite";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import logger from "logger";
import { config } from "./config";

const dbPath = config.DB_PATH;

// Migrate minecraft database
logger.info({ database: "minecraft" }, "Running migrations");
const minecraftSqlite = new Database(join(dbPath, "minecraft.sqlite"), {
	create: true,
});
minecraftSqlite.exec("PRAGMA journal_mode = WAL;");
const minecraftDb = drizzle(minecraftSqlite);

try {
	migrate(minecraftDb, {
		migrationsFolder: join(dbPath, "migrations/minecraft"),
	});
	logger.info({ database: "minecraft" }, "Migrations complete");
} catch (_e) {
	logger.info({ database: "minecraft" }, "No migrations found or already up to date");
}
minecraftSqlite.close();

// Migrate core database
logger.info({ database: "core" }, "Running migrations");
const coreSqlite = new Database(join(dbPath, "core.sqlite"), { create: true });
coreSqlite.exec("PRAGMA journal_mode = WAL;");
const coreDb = drizzle(coreSqlite);

try {
	migrate(coreDb, { migrationsFolder: join(dbPath, "migrations/core") });
	logger.info({ database: "core" }, "Migrations complete");
} catch (_e) {
	logger.info({ database: "core" }, "No migrations found or already up to date");
}
coreSqlite.close();

logger.info("All migrations complete");
