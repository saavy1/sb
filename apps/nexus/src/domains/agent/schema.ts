import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const agentThreads = sqliteTable("agent_threads", {
	id: text("id").primaryKey(),

	// Thread status
	status: text("status", { enum: ["active", "sleeping", "complete", "failed"] })
		.notNull()
		.default("active"),

	// Display title (auto-generated from first exchange)
	title: text("title"),

	// Origin tracking
	source: text("source", { enum: ["chat", "discord", "event", "scheduled"] }).notNull(),
	sourceId: text("source_id"), // conversation id, discord channel, event type, etc.

	// Conversation state (JSON)
	messages: text("messages").notNull().default("[]"),

	// Arbitrary context the agent persists across sleep/wake
	context: text("context").notNull().default("{}"),

	// Wake scheduling
	wakeJobId: text("wake_job_id"), // BullMQ job ID for cancellation
	wakeReason: text("wake_reason"), // Injected into prompt on wake

	// Metadata
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});

export type AgentThread = typeof agentThreads.$inferSelect;
export type NewAgentThread = typeof agentThreads.$inferInsert;
