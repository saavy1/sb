import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const operations = sqliteTable("operations", {
	id: text("id").primaryKey(),
	type: text("type").notNull(), // 'nixos-rebuild' | 'flux-reconcile'
	status: text("status").notNull(), // 'pending' | 'running' | 'success' | 'failed'
	triggeredBy: text("triggered_by").notNull(), // 'webhook' | 'dashboard' | 'cli'
	triggeredByUser: text("triggered_by_user"), // username if available
	output: text("output"), // stdout/stderr
	errorMessage: text("error_message"),
	startedAt: text("started_at").notNull(),
	completedAt: text("completed_at"),
	durationMs: integer("duration_ms"),
});

export type OperationRecord = typeof operations.$inferSelect;
export type NewOperationRecord = typeof operations.$inferInsert;
