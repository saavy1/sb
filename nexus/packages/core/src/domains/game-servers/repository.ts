import { desc, eq } from "drizzle-orm";
import { gameServersDb } from "../../infra/db";
import { type Server, servers } from "./schema";
import type { GameServerStatusType, GameServerType } from "./types";

function mapToGameServer(row: Server): GameServerType {
	return {
		id: row.id,
		name: row.name,
		gameType: "minecraft",
		modpack: row.modpack ?? undefined,
		status: row.status as GameServerStatusType,
		port: row.port ?? undefined,
		createdBy: row.createdBy,
		createdAt: row.createdAt,
		memory: row.memory ?? undefined,
		k8sDeployment: row.k8sDeployment ?? undefined,
	};
}

export const gameServerRepository = {
	async findAll(): Promise<GameServerType[]> {
		const rows = await gameServersDb.select().from(servers).orderBy(desc(servers.createdAt));
		return rows.map(mapToGameServer);
	},

	async findByName(name: string): Promise<GameServerType | null> {
		const rows = await gameServersDb.select().from(servers).where(eq(servers.name, name));
		return rows[0] ? mapToGameServer(rows[0]) : null;
	},

	async create(server: {
		id: string;
		name: string;
		modpack: string;
		createdBy: string;
		memory?: string;
	}): Promise<GameServerType> {
		const now = new Date();

		const results = await gameServersDb
			.insert(servers)
			.values({
				id: server.id,
				name: server.name,
				gameType: "minecraft",
				modpack: server.modpack,
				status: "stopped",
				createdBy: server.createdBy,
				createdAt: now,
				memory: server.memory,
			})
			.returning();

		return mapToGameServer(results[0]);
	},

	async updateStatus(name: string, status: GameServerStatusType, port?: number): Promise<void> {
		await gameServersDb
			.update(servers)
			.set({ status, port: port ?? null })
			.where(eq(servers.name, name));
	},

	async updateK8sDeployment(name: string, deployment: string): Promise<void> {
		await gameServersDb
			.update(servers)
			.set({ k8sDeployment: deployment })
			.where(eq(servers.name, name));
	},

	async delete(name: string): Promise<boolean> {
		const existing = await this.findByName(name);
		if (!existing) return false;

		await gameServersDb.delete(servers).where(eq(servers.name, name));
		return true;
	},
};
