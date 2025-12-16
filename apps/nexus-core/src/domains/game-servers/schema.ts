import { index, integer, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

// Postgres schema for game-servers tables
export const gameServersSchema = pgSchema("game_servers");

export const servers = gameServersSchema.table(
	"servers",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull().unique(),
		gameType: text("game_type").notNull().default("minecraft"),
		modpack: text("modpack"),
		status: text("status").notNull().default("stopped"),
		port: integer("port"),
		createdBy: text("created_by").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		memory: text("memory"),
		k8sDeployment: text("k8s_deployment"),
	},
	(table) => [
		index("idx_servers_name").on(table.name),
		index("idx_servers_status").on(table.status),
		index("idx_servers_created_by").on(table.createdBy),
	]
);

export type Server = typeof servers.$inferSelect;
export type NewServer = typeof servers.$inferInsert;
