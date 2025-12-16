import { index, integer, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

// Postgres schema for system-info tables
export const systemInfoSchema = pgSchema("system_info");

export const drives = systemInfoSchema.table(
	"drives",
	{
		id: text("id").primaryKey(),
		path: text("path").notNull().unique(),
		label: text("label").notNull(),
		expectedCapacity: integer("expected_capacity"), // GB, optional for alerting
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [index("idx_drives_path").on(table.path)]
);

export type DriveRecord = typeof drives.$inferSelect;
export type NewDriveRecord = typeof drives.$inferInsert;
