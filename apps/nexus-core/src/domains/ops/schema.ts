import { integer, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

// Postgres schema for ops tables
export const opsSchema = pgSchema("ops");

export const operations = opsSchema.table("operations", {
	id: text("id").primaryKey(),
	type: text("type").notNull(), // 'nixos-rebuild' | 'flux-reconcile'
	status: text("status").notNull(), // 'pending' | 'running' | 'success' | 'failed'
	triggeredBy: text("triggered_by").notNull(), // 'webhook' | 'dashboard' | 'cli'
	triggeredByUser: text("triggered_by_user"), // username if available
	output: text("output"), // stdout/stderr
	errorMessage: text("error_message"),
	startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
	completedAt: timestamp("completed_at", { withTimezone: true }),
	durationMs: integer("duration_ms"),
});

export type OperationRecord = typeof operations.$inferSelect;
export type NewOperationRecord = typeof operations.$inferInsert;
