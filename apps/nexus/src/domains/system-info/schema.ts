import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const drives = sqliteTable(
  "drives",
  {
    id: text("id").primaryKey(),
    path: text("path").notNull().unique(),
    label: text("label").notNull(),
    expectedCapacity: integer("expected_capacity"), // GB, optional for alerting
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_drives_path").on(table.path)],
);

export type DriveRecord = typeof drives.$inferSelect;
export type NewDriveRecord = typeof drives.$inferInsert;
