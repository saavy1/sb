import { index, integer, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

// Postgres schema for core tables
export const coreSchema = pgSchema("core");

export const jobs = coreSchema.table(
	"jobs",
	{
		id: text("id").primaryKey(),
		type: text("type").notNull(),
		payload: text("payload").notNull(),
		status: text("status").notNull().default("pending"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		startedAt: timestamp("started_at", { withTimezone: true }),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		error: text("error"),
	},
	(table) => [index("idx_jobs_status").on(table.status), index("idx_jobs_type").on(table.type)]
);

export const users = coreSchema.table("users", {
	discordId: text("discord_id").primaryKey(),
	username: text("username").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});

export const permissions = coreSchema.table(
	"permissions",
	{
		id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
		discordId: text("discord_id")
			.notNull()
			.references(() => users.discordId),
		resourceType: text("resource_type").notNull(),
		resourceId: text("resource_id"),
		permission: text("permission").notNull(),
		grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [index("idx_permissions_discord_id").on(table.discordId)]
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;
