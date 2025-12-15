import { integer, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

// Postgres schema for apps tables
export const appsSchema = pgSchema("apps");

export const apps = appsSchema.table("apps", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	url: text("url").notNull(),
	icon: text("icon"), // lucide icon name or emoji
	category: text("category", {
		enum: ["media", "tools", "monitoring", "development", "other"],
	})
		.notNull()
		.default("other"),
	healthCheckUrl: text("health_check_url"),
	description: text("description"),
	sortOrder: integer("sort_order").notNull().default(0),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type App = typeof apps.$inferSelect;
export type NewApp = typeof apps.$inferInsert;
