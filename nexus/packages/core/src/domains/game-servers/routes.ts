import { Elysia, t } from "elysia";
import {
	create,
	deleteServer,
	get,
	list,
	listGameServerPods,
	queryServerStatus,
	start,
	stop,
	syncStatus,
} from "./functions";
import { getLastMinecraftStatus } from "./monitor";
import { ApiError, CreateServerRequest, GameServer, ServerNameParam } from "./types";

export const gameServerRoutes = new Elysia({ prefix: "/gameServers" })
	.get(
		"/",
		async () => {
			return await list();
		},
		{
			detail: { tags: ["Game Servers"], summary: "List all game servers" },
			response: { 200: t.Array(GameServer) },
		}
	)
	.get(
		"/:name",
		async ({ params, set }) => {
			const server = await get(params.name);
			if (!server) {
				set.status = 404;
				return { error: "Server not found" };
			}
			return server;
		},
		{
			detail: { tags: ["Game Servers"], summary: "Get server by name" },
			params: ServerNameParam,
			response: { 200: GameServer, 404: ApiError },
		}
	)
	.post(
		"/",
		async ({ body, set }) => {
			try {
				return await create(body);
			} catch (e) {
				const message = e instanceof Error ? e.message : "Failed to create server";
				set.status = 400;
				return { error: message };
			}
		},
		{
			detail: { tags: ["Game Servers"], summary: "Create a new game server" },
			body: CreateServerRequest,
			response: { 200: GameServer, 400: ApiError },
		}
	)
	.post(
		"/:name/start",
		async ({ params, set }) => {
			try {
				return await start(params.name);
			} catch (e) {
				const message = e instanceof Error ? e.message : "Failed to start server";
				set.status = 400;
				return { error: message };
			}
		},
		{
			detail: { tags: ["Game Servers"], summary: "Start a game server" },
			params: ServerNameParam,
			response: { 200: GameServer, 400: ApiError },
		}
	)
	.post(
		"/:name/stop",
		async ({ params, set }) => {
			try {
				return await stop(params.name);
			} catch (e) {
				const message = e instanceof Error ? e.message : "Failed to stop server";
				set.status = 400;
				return { error: message };
			}
		},
		{
			detail: { tags: ["Game Servers"], summary: "Stop a game server" },
			params: ServerNameParam,
			response: { 200: GameServer, 400: ApiError },
		}
	)
	.delete(
		"/:name",
		async (ctx) => {
			try {
				await deleteServer(ctx.params.name);
				return { success: true };
			} catch (e) {
				const message = e instanceof Error ? e.message : "Failed to delete server";
				ctx.set.status = 400;
				return { error: message };
			}
		},
		{
			detail: { tags: ["Game Servers"], summary: "Delete a game server" },
			params: ServerNameParam,
			response: { 200: t.Object({ success: t.Boolean() }), 400: ApiError },
		}
	)
	.post(
		"/:name/sync",
		async (ctx) => {
			const server = await syncStatus(ctx.params.name);
			if (!server) {
				ctx.set.status = 404;
				return { error: "Server not found" };
			}
			return server;
		},
		{
			detail: {
				tags: ["Game Servers"],
				summary: "Sync server status with K8s",
			},
			params: ServerNameParam,
			response: { 200: GameServer, 404: ApiError },
		}
	)
	.get(
		"/minecraft/status",
		async () => {
			// Return cached status from monitor if available (faster)
			const cached = getLastMinecraftStatus();
			if (cached) {
				return cached;
			}

			// Fall back to fresh query if monitor hasn't run yet
			const status = await queryServerStatus();
			if (!status) {
				return {
					online: false,
					timestamp: new Date().toISOString(),
				};
			}
			return {
				online: true,
				version: status.version,
				players: {
					online: status.players.online,
					max: status.players.max,
					list: status.players.sample.map((p) => p.name),
				},
				motd: status.motd,
				latency: status.latency,
				timestamp: new Date().toISOString(),
			};
		},
		{
			detail: {
				tags: ["Game Servers"],
				summary: "Get live Minecraft server status",
			},
			response: {
				200: t.Object({
					online: t.Boolean(),
					version: t.Optional(t.String()),
					players: t.Optional(
						t.Object({
							online: t.Number(),
							max: t.Number(),
							list: t.Array(t.String()),
						})
					),
					motd: t.Optional(t.String()),
					latency: t.Optional(t.Number()),
					timestamp: t.String(),
					playerJoined: t.Optional(t.Array(t.String())),
					playerLeft: t.Optional(t.Array(t.String())),
					statusChanged: t.Optional(t.Boolean()),
				}),
			},
		}
	)
	.get(
		"/pods",
		async () => {
			try {
				const pods = await listGameServerPods();
				return { success: true, pods };
			} catch (error) {
				return {
					success: false,
					pods: [],
					error: error instanceof Error ? error.message : "Failed to list pods",
				};
			}
		},
		{
			detail: {
				tags: ["Game Servers"],
				summary: "List K8s pods for game servers",
			},
			response: {
				200: t.Object({
					success: t.Boolean(),
					pods: t.Array(
						t.Object({
							name: t.String(),
							serverName: t.String(),
							phase: t.String(),
							ready: t.Boolean(),
							restarts: t.Number(),
							podIP: t.Optional(t.String()),
							startTime: t.Optional(t.String()),
						})
					),
					error: t.Optional(t.String()),
				}),
			},
		}
	);
