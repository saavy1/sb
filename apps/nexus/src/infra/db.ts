import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as agentSchema from "../domains/agent/schema";
import * as appsSchema from "../domains/apps/schema";
import * as coreSchema from "../domains/core/schema";
import * as gameServerSchema from "../domains/game-servers/schema";
import * as opsSchema from "../domains/ops/schema";
import * as systemInfoSchema from "../domains/system-info/schema";
import { config } from "./config";

// === Postgres databases (shared connection pool, separate schemas) ===

// In production, DATABASE_URL is required. In dev, fall back to a local default.
const databaseUrl =
	config.DATABASE_URL ||
	(config.NODE_ENV === "development" ? "postgresql://nexus:nexus@localhost:5432/nexus" : null);

if (!databaseUrl) {
	throw new Error("DATABASE_URL is required for Postgres connection in production");
}

export const pgClient = postgres(databaseUrl, {
	max: 10, // Connection pool size
	idle_timeout: 20,
	connect_timeout: 10,
});

export const agentDb = drizzlePostgres(pgClient, { schema: agentSchema });
export const appsDb = drizzlePostgres(pgClient, { schema: appsSchema });
export const coreDb = drizzlePostgres(pgClient, { schema: coreSchema });
export const gameServersDb = drizzlePostgres(pgClient, { schema: gameServerSchema });
export const opsDb = drizzlePostgres(pgClient, { schema: opsSchema });
export const systemInfoDb = drizzlePostgres(pgClient, { schema: systemInfoSchema });

// Export schemas for easy access
export { agentSchema, appsSchema, coreSchema, gameServerSchema, opsSchema, systemInfoSchema };

// Graceful shutdown
process.on("beforeExit", async () => {
	await pgClient.end();
});
