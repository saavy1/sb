import { index, integer, jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";
import type { ThreadMessageType } from "./types";

// Postgres schema for agent tables
export const agentSchema = pgSchema("agent");

// Context type for JSONB column
export type ThreadContext = Record<string, unknown>;

export const agentThreads = agentSchema.table(
	"threads",
	{
		id: text("id").primaryKey(),

		// Optimistic locking
		version: integer("version").notNull().default(1),

		// Thread status
		status: text("status", { enum: ["active", "sleeping", "complete", "failed"] })
			.notNull()
			.default("active"),

		// Display title (auto-generated from first exchange)
		title: text("title"),

		// Origin tracking
		source: text("source", { enum: ["chat", "discord", "event", "scheduled", "alert"] }).notNull(),
		sourceId: text("source_id"), // conversation id, discord channel, event type, etc.

		// Conversation state (JSONB - automatically serialized/deserialized)
		messages: jsonb("messages").$type<ThreadMessageType[]>().notNull().default([]),

		// Arbitrary context the agent persists across sleep/wake
		context: jsonb("context").$type<ThreadContext>().notNull().default({}),

		// Wake scheduling
		wakeJobId: text("wake_job_id"), // BullMQ job ID for cancellation
		wakeReason: text("wake_reason"), // Injected into prompt on wake

		// Metadata
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index("idx_threads_status").on(table.status),
		index("idx_threads_source").on(table.source, table.sourceId),
		index("idx_threads_updated").on(table.updatedAt),
	]
);

export type AgentThread = typeof agentThreads.$inferSelect;
export type NewAgentThread = typeof agentThreads.$inferInsert;
