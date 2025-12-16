import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import logger from "@nexus/logger";
import * as agentSchema from "../domains/agent/schema";
import * as appsSchema from "../domains/apps/schema";
import * as coreSchema from "../domains/core/schema";
import * as gameServerSchema from "../domains/game-servers/schema";
import * as opsSchema from "../domains/ops/schema";
import * as systemInfoSchema from "../domains/system-info/schema";
import { config } from "./config";

const log = logger.child({ module: "db" });

// === Postgres databases (shared connection, separate schemas) ===

// In production, DATABASE_URL is required. In dev, fall back to a local default.
function getDatabaseUrl(): string {
	const url =
		config.DATABASE_URL ||
		(config.NODE_ENV === "development" ? "postgresql://nexus:nexus@localhost:5432/nexus" : null);
	if (!url) {
		throw new Error("DATABASE_URL is required for Postgres connection in production");
	}
	return url;
}

const databaseUrl = getDatabaseUrl();

// Log connection info (without password)
try {
	const url = new URL(databaseUrl);
	log.info({
		host: url.hostname,
		port: url.port || "5432",
		database: url.pathname.slice(1),
		user: url.username,
	}, "Database connection config");
} catch {
	log.info("Database URL configured");
}

// Create postgres client with connection pool
export const pgClient = postgres(databaseUrl, {
	max: 10, // Max connections in pool
	idle_timeout: 30, // Close idle connections after 30 seconds
	connect_timeout: 10, // 10 second connection timeout
	onnotice: () => {}, // Suppress notice messages
});

// All Drizzle instances share the same postgres client
export const agentDb = drizzle(pgClient, { schema: agentSchema });
export const appsDb = drizzle(pgClient, { schema: appsSchema });
export const coreDb = drizzle(pgClient, { schema: coreSchema });
export const gameServersDb = drizzle(pgClient, { schema: gameServerSchema });
export const opsDb = drizzle(pgClient, { schema: opsSchema });
export const systemInfoDb = drizzle(pgClient, { schema: systemInfoSchema });

// Helper to check if an error is a connection error
function isConnectionError(err: unknown): boolean {
	if (err instanceof Error) {
		const msg = err.message;
		const code = (err as { code?: string }).code;
		return (
			msg.includes("CONNECTION_CLOSED") ||
			msg.includes("ECONNREFUSED") ||
			msg.includes("ECONNRESET") ||
			code === "ERR_POSTGRES_CONNECTION_CLOSED" ||
			code === "ERR_POSTGRES_CONNECTION_TIMEOUT" ||
			code === "ECONNREFUSED" ||
			code === "ECONNRESET"
		);
	}
	return false;
}

// Helper for raw SQL queries with retry
export async function withDb<T>(fn: (client: typeof pgClient) => Promise<T>): Promise<T> {
	try {
		return await fn(pgClient);
	} catch (err) {
		if (isConnectionError(err)) {
			log.warn({ error: err }, "Raw SQL query failed, retrying...");
			return await fn(pgClient);
		}
		throw err;
	}
}

// Wrapper for Drizzle queries with retry on connection errors
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (err) {
		if (isConnectionError(err)) {
			log.warn({ error: err }, "Query failed with connection error, retrying...");
			return await fn();
		}
		throw err;
	}
}

// Export schemas for easy access
export { agentSchema, appsSchema, coreSchema, gameServerSchema, opsSchema, systemInfoSchema };

// Health check - test if database is reachable
export async function checkDatabaseHealth(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
	const start = Date.now();
	try {
		await pgClient`SELECT 1`;
		return { ok: true, latencyMs: Date.now() - start };
	} catch (err) {
		const error = err instanceof Error ? err.message : String(err);
		const code = (err as { code?: string }).code;
		log.error({ error, code }, "Database health check failed");
		return { ok: false, error: code || error };
	}
}

// Graceful shutdown - handle multiple signals for hot reload scenarios
async function cleanup() {
	try {
		await pgClient.end({ timeout: 3 });
	} catch {
		// Ignore cleanup errors
	}
}

process.on("beforeExit", cleanup);
process.on("exit", cleanup);

// For Bun hot reload - these fire when the process is about to restart
if (typeof Bun !== "undefined") {
	// @ts-expect-error - Bun-specific
	Bun.onBeforeUnload?.(cleanup);
}
