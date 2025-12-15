import { Elysia, t } from "elysia";
import { create, deleteServer, get, list, start, stop, syncStatus } from "./functions";
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
	);
