import { index, integer, jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";
import type { ModelMessage } from "@tanstack/ai";

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
		messages: jsonb("messages").$type<ModelMessage[]>().notNull().default([]),

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

// Global settings (key-value store) - shared between API and workers
export const settings = agentSchema.table("settings", {
	key: text("key").primaryKey(),
	value: text("value").notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;

// AI provider registry (OpenRouter, vLLM endpoints, etc.)
export const aiProviders = agentSchema.table("ai_providers", {
	id: text("id").primaryKey(), // e.g. "openrouter", "local-vllm"
	name: text("name").notNull(), // Display name
	type: text("type", { enum: ["openrouter", "openai-compatible"] }).notNull(),
	baseUrl: text("base_url"), // null for OpenRouter (uses SDK default)
	apiKey: text("api_key"), // null = use env var fallback or not needed
	enabled: integer("enabled").notNull().default(1), // 1 = true, 0 = false
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AiProvider = typeof aiProviders.$inferSelect;
export type NewAiProvider = typeof aiProviders.$inferInsert;

// AI model registry
export const aiModels = agentSchema.table(
	"ai_models",
	{
		id: text("id").primaryKey(), // e.g. "openrouter:deepseek/deepseek-v3.2"
		providerId: text("provider_id")
			.notNull()
			.references(() => aiProviders.id, { onDelete: "cascade" }),
		modelId: text("model_id").notNull(), // The ID sent to the provider API
		name: text("name").notNull(), // Display name
		enabled: integer("enabled").notNull().default(1),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [index("idx_ai_models_provider").on(table.providerId)]
);

export type AiModel = typeof aiModels.$inferSelect;
export type NewAiModel = typeof aiModels.$inferInsert;
