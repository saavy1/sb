import { eq, desc } from "drizzle-orm";
import { minecraftDb } from "../../infra/db";
import { servers, type Server } from "./schema";
import type { GameServerType, GameServerStatusType } from "./types";

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
  findAll(): GameServerType[] {
    const rows = minecraftDb
      .select()
      .from(servers)
      .orderBy(desc(servers.createdAt))
      .all();
    return rows.map(mapToGameServer);
  },

  findByName(name: string): GameServerType | null {
    const row = minecraftDb
      .select()
      .from(servers)
      .where(eq(servers.name, name))
      .get();
    return row ? mapToGameServer(row) : null;
  },

  create(server: {
    id: string;
    name: string;
    modpack: string;
    createdBy: string;
    memory?: string;
  }): GameServerType {
    const now = new Date().toISOString();
    
    minecraftDb.insert(servers).values({
      id: server.id,
      name: server.name,
      gameType: "minecraft",
      modpack: server.modpack,
      status: "stopped",
      createdBy: server.createdBy,
      createdAt: now,
      memory: server.memory,
    }).run();

    return {
      id: server.id,
      name: server.name,
      gameType: "minecraft",
      modpack: server.modpack,
      status: "stopped",
      createdBy: server.createdBy,
      createdAt: now,
      memory: server.memory,
    };
  },

  updateStatus(name: string, status: GameServerStatusType, port?: number): void {
    minecraftDb
      .update(servers)
      .set({ status, port: port ?? null })
      .where(eq(servers.name, name))
      .run();
  },

  updateK8sDeployment(name: string, deployment: string): void {
    minecraftDb
      .update(servers)
      .set({ k8sDeployment: deployment })
      .where(eq(servers.name, name))
      .run();
  },

  delete(name: string): boolean {
    const existing = this.findByName(name);
    if (!existing) return false;
    
    minecraftDb
      .delete(servers)
      .where(eq(servers.name, name))
      .run();
    return true;
  },
};
