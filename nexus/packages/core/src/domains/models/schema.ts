import { index, jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

// Postgres schema for the models domain (KServe-backed inference workloads).
export const modelsSchema = pgSchema("models");

// Allowed status values, mirrored by the ModelStatus Elysia union in types.ts.
// - draft       : config saved, weights not on disk yet
// - downloading : BullMQ model-downloads job is streaming weights to disk
// - downloaded  : weights on disk, InferenceService not created
// - starting    : InferenceService created, pod not Ready
// - running     : InferenceService Ready
// - stopping    : scale-down requested
// - stopped     : InferenceService exists but minReplicas=0 (or CR absent after a stop)
// - error       : last operation failed; see lastError
export const models = modelsSchema.table(
	"models",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull().unique(),
		hfRepoId: text("hf_repo_id").notNull(),
		hfRevision: text("hf_revision"),
		runtime: text("runtime").notNull().default("vllm"),
		servedModelName: text("served_model_name"),
		status: text("status").notNull().default("draft"),
		downloadJobName: text("download_job_name"),
		// Free-form vLLM runtime config (see ModelConfig in types.ts).
		// Kept as jsonb so we can iterate on fields without per-field migrations.
		config: jsonb("config").notNull().default({}),
		// Optional: where the recipe defaults came from (e.g. a spark-arena URL).
		sparkArenaSource: text("spark_arena_source"),
		// Optional: VRAM estimation / metadata from the source recipe.
		metadata: jsonb("metadata").notNull().default({}),
		lastError: text("last_error"),
		createdBy: text("created_by").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		lastStartedAt: timestamp("last_started_at", { withTimezone: true }),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index("idx_models_name").on(table.name),
		index("idx_models_status").on(table.status),
		index("idx_models_created_by").on(table.createdBy),
	]
);

export type Model = typeof models.$inferSelect;
export type NewModel = typeof models.$inferInsert;
