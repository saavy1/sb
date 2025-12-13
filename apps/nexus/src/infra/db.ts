import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { config } from "./config";
import { join } from "node:path";
import * as gameServerSchema from "../domains/game-servers/schema";
import * as coreSchema from "../domains/core/schema";

const dbPath = config.DB_PATH;

// Create SQLite connections
const minecraftSqlite = new Database(join(dbPath, "minecraft.sqlite"), {
	create: true,
});
const coreSqlite = new Database(join(dbPath, "core.sqlite"), {
	create: true,
});

// Enable WAL mode for better concurrency
minecraftSqlite.exec("PRAGMA journal_mode = WAL;");
coreSqlite.exec("PRAGMA journal_mode = WAL;");

// Drizzle instances with schemas
export const minecraftDb = drizzle(minecraftSqlite, {
	schema: gameServerSchema,
});
export const coreDb = drizzle(coreSqlite, { schema: coreSchema });

// Export schemas for easy access
export { gameServerSchema, coreSchema };

// Graceful shutdown
process.on("beforeExit", () => {
	minecraftSqlite.close();
	coreSqlite.close();
});
