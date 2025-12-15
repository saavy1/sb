import { Database } from "bun:sqlite";
import { join } from "node:path";
import { drizzle as drizzleSqlite } from "drizzle-orm/bun-sqlite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as agentSchema from "../domains/agent/schema";
import * as appsSchema from "../domains/apps/schema";
import * as coreSchema from "../domains/core/schema";
import * as gameServerSchema from "../domains/game-servers/schema";
import * as opsSchema from "../domains/ops/schema";
import * as systemInfoSchema from "../domains/system-info/schema";
import { config } from "./config";

const dbPath = config.DB_PATH;

// === SQLite databases (to be migrated to Postgres) ===

const systemInfoSqlite = new Database(join(dbPath, "system-info.sqlite"), {
	create: true,
});
const opsSqlite = new Database(join(dbPath, "ops.sqlite"), {
	create: true,
});

// Enable WAL mode for better concurrency
systemInfoSqlite.exec("PRAGMA journal_mode = WAL;");
opsSqlite.exec("PRAGMA journal_mode = WAL;");

// SQLite Drizzle instances
export const systemInfoDb = drizzleSqlite(systemInfoSqlite, {
	schema: systemInfoSchema,
});
export const opsDb = drizzleSqlite(opsSqlite, { schema: opsSchema });

// === Postgres databases (shared connection pool, separate schemas) ===

// In production, DATABASE_URL is required. In dev, fall back to a local default.
const databaseUrl =
	config.DATABASE_URL ||
	(config.NODE_ENV === "development" ? "postgresql://nexus:nexus@localhost:5432/nexus" : null);

if (!databaseUrl) {
	throw new Error("DATABASE_URL is required for Postgres connection in production");
}

const pgClient = postgres(databaseUrl, {
	max: 10, // Connection pool size
	idle_timeout: 20,
	connect_timeout: 10,
});

export const agentDb = drizzlePostgres(pgClient, { schema: agentSchema });
export const appsDb = drizzlePostgres(pgClient, { schema: appsSchema });
export const coreDb = drizzlePostgres(pgClient, { schema: coreSchema });
export const gameServersDb = drizzlePostgres(pgClient, { schema: gameServerSchema });

// Export schemas for easy access
export { agentSchema, appsSchema, coreSchema, gameServerSchema, opsSchema, systemInfoSchema };

// Graceful shutdown
process.on("beforeExit", async () => {
	systemInfoSqlite.close();
	opsSqlite.close();
	await pgClient.end();
});
