import { Database } from "bun:sqlite";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as appsSchema from "../domains/apps/schema";
import * as coreSchema from "../domains/core/schema";
import * as gameServerSchema from "../domains/game-servers/schema";
import * as opsSchema from "../domains/ops/schema";
import * as systemInfoSchema from "../domains/system-info/schema";
import { config } from "./config";

const dbPath = config.DB_PATH;

// Create SQLite connections
const minecraftSqlite = new Database(join(dbPath, "minecraft.sqlite"), {
	create: true,
});
const coreSqlite = new Database(join(dbPath, "core.sqlite"), {
	create: true,
});
const systemInfoSqlite = new Database(join(dbPath, "system-info.sqlite"), {
	create: true,
});
const opsSqlite = new Database(join(dbPath, "ops.sqlite"), {
	create: true,
});
const appsSqlite = new Database(join(dbPath, "apps.sqlite"), {
	create: true,
});

// Enable WAL mode for better concurrency
minecraftSqlite.exec("PRAGMA journal_mode = WAL;");
coreSqlite.exec("PRAGMA journal_mode = WAL;");
systemInfoSqlite.exec("PRAGMA journal_mode = WAL;");
opsSqlite.exec("PRAGMA journal_mode = WAL;");
appsSqlite.exec("PRAGMA journal_mode = WAL;");

// Drizzle instances with schemas
export const minecraftDb = drizzle(minecraftSqlite, {
	schema: gameServerSchema,
});
export const coreDb = drizzle(coreSqlite, { schema: coreSchema });
export const systemInfoDb = drizzle(systemInfoSqlite, {
	schema: systemInfoSchema,
});
export const opsDb = drizzle(opsSqlite, { schema: opsSchema });
export const appsDb = drizzle(appsSqlite, { schema: appsSchema });

// Export schemas for easy access
export { appsSchema, coreSchema, gameServerSchema, opsSchema, systemInfoSchema };

// Graceful shutdown
process.on("beforeExit", () => {
	minecraftSqlite.close();
	coreSqlite.close();
	systemInfoSqlite.close();
	opsSqlite.close();
	appsSqlite.close();
});
