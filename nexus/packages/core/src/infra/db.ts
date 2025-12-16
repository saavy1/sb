import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import * as agentSchema from "../domains/agent/schema";
import * as appsSchema from "../domains/apps/schema";
import * as coreSchema from "../domains/core/schema";
import * as gameServerSchema from "../domains/game-servers/schema";
import * as opsSchema from "../domains/ops/schema";
import * as systemInfoSchema from "../domains/system-info/schema";
import { config } from "./config";

// === Postgres databases (shared connection, separate schemas) ===

// In production, DATABASE_URL is required. In dev, fall back to a local default.
const databaseUrl =
	config.DATABASE_URL ||
	(config.NODE_ENV === "development" ? "postgresql://nexus:nexus@localhost:5432/nexus" : null);

if (!databaseUrl) {
	throw new Error("DATABASE_URL is required for Postgres connection in production");
}

export const pgClient = new SQL(databaseUrl);

export const agentDb = drizzle({ client: pgClient, schema: agentSchema });
export const appsDb = drizzle({ client: pgClient, schema: appsSchema });
export const coreDb = drizzle({ client: pgClient, schema: coreSchema });
export const gameServersDb = drizzle({ client: pgClient, schema: gameServerSchema });
export const opsDb = drizzle({ client: pgClient, schema: opsSchema });
export const systemInfoDb = drizzle({ client: pgClient, schema: systemInfoSchema });

// Export schemas for easy access
export { agentSchema, appsSchema, coreSchema, gameServerSchema, opsSchema, systemInfoSchema };

// Graceful shutdown
process.on("beforeExit", async () => {
	await pgClient.close();
});
