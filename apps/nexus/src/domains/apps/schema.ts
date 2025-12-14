import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const apps = sqliteTable("apps", {
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
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export type App = typeof apps.$inferSelect;
export type NewApp = typeof apps.$inferInsert;
