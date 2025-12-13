export interface GameServer {
  id: string;
  name: string;
  gameType: "minecraft";
  modpack?: string;
  status: "stopped" | "starting" | "running" | "stopping" | "error";
  port?: number;
  createdBy: string;
  createdAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CreateServerRequest {
  name: string;
  modpack: string;
  createdBy: string;
}
