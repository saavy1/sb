import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const servers = sqliteTable(
	"servers",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull().unique(),
		gameType: text("game_type").notNull().default("minecraft"),
		modpack: text("modpack"),
		status: text("status").notNull().default("stopped"),
		port: integer("port"),
		createdBy: text("created_by").notNull(),
		createdAt: text("created_at").notNull(),
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
