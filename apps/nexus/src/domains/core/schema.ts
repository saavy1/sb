import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    payload: text("payload").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: text("created_at").notNull(),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    error: text("error"),
  },
  (table) => [
    index("idx_jobs_status").on(table.status),
    index("idx_jobs_type").on(table.type),
  ]
);

export const users = sqliteTable("users", {
  discordId: text("discord_id").primaryKey(),
  username: text("username").notNull(),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at"),
});

export const permissions = sqliteTable(
  "permissions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    discordId: text("discord_id")
      .notNull()
      .references(() => users.discordId),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    permission: text("permission").notNull(),
    grantedAt: text("granted_at").notNull(),
  },
  (table) => [index("idx_permissions_discord_id").on(table.discordId)]
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;
