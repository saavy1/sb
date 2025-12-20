import { drizzle } from "drizzle-orm/bun-sql";
import type { Logger } from "drizzle-orm/logger";
import { SQL } from "bun";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import logger from "@nexus/logger";
import * as agentSchema from "../domains/agent/schema";
import * as appsSchema from "../domains/apps/schema";
import * as coreSchema from "../domains/core/schema";
import * as gameServerSchema from "../domains/game-servers/schema";
import * as opsSchema from "../domains/ops/schema";
import * as systemInfoSchema from "../domains/system-info/schema";
import { config } from "./config";

const log = logger.child({ module: "db" });
const tracer = trace.getTracer("drizzle");

/**
 * Drizzle logger that creates OpenTelemetry spans for queries.
 * Logs query execution with timing and creates trace spans.
 */
class TracedLogger implements Logger {
	logQuery(query: string, params: unknown[]): void {
		const span = trace.getActiveSpan();
		if (span) {
			// Add query info as span attributes
			span.setAttribute("db.system", "postgresql");
			span.setAttribute("db.statement", query.slice(0, 1000)); // Truncate long queries
			span.setAttribute("db.operation", this.extractOperation(query));
			const table = this.extractTable(query);
			if (table) {
				span.setAttribute("db.sql.table", table);
			}
		}
		log.debug({ query: query.slice(0, 200), paramCount: params.length }, "SQL query");
	}

	private extractOperation(query: string): string {
		const first = query.trim().split(/\s+/)[0]?.toUpperCase();
		return first || "UNKNOWN";
	}

	private extractTable(query: string): string | null {
		// Match common patterns: FROM table, INTO table, UPDATE table, JOIN table
		const patterns = [
			/\bFROM\s+"?(\w+)"?/i,
			/\bINTO\s+"?(\w+)"?/i,
			/\bUPDATE\s+"?(\w+)"?/i,
			/\bJOIN\s+"?(\w+)"?/i,
		];
		for (const pattern of patterns) {
			const match = query.match(pattern);
			if (match) return match[1];
		}
		return null;
	}
}

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

// Create Bun SQL client
export const pgClient = new SQL(databaseUrl);

// Shared traced logger instance
const tracedLogger = new TracedLogger();

// All Drizzle instances share the same SQL client and logger
export const agentDb = drizzle(pgClient, { schema: agentSchema, logger: tracedLogger });
export const appsDb = drizzle(pgClient, { schema: appsSchema, logger: tracedLogger });
export const coreDb = drizzle(pgClient, { schema: coreSchema, logger: tracedLogger });
export const gameServersDb = drizzle(pgClient, { schema: gameServerSchema, logger: tracedLogger });
export const opsDb = drizzle(pgClient, { schema: opsSchema, logger: tracedLogger });
export const systemInfoDb = drizzle(pgClient, { schema: systemInfoSchema, logger: tracedLogger });

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
export async function withDb<T>(fn: (client: SQL) => Promise<T>): Promise<T> {
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

/**
 * Execute a database operation within an OTEL span.
 * Use this for important queries where you want dedicated span visibility.
 */
export async function traceQuery<T>(name: string, fn: () => Promise<T>): Promise<T> {
	return tracer.startActiveSpan(`db.${name}`, async (span) => {
		try {
			span.setAttribute("db.system", "postgresql");
			const result = await fn();
			span.setStatus({ code: SpanStatusCode.OK });
			return result;
		} catch (error) {
			span.setStatus({
				code: SpanStatusCode.ERROR,
				message: error instanceof Error ? error.message : "Unknown error",
			});
			span.recordException(error as Error);
			throw error;
		} finally {
			span.end();
		}
	});
}

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

// Graceful shutdown
async function cleanup() {
	try {
		pgClient.close();
	} catch {
		// Ignore cleanup errors
	}
}

process.on("beforeExit", cleanup);
process.on("exit", cleanup);
