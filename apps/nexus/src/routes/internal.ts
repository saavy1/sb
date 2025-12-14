import { Elysia, t } from "elysia";
import logger from "logger";
import { list, syncStatus } from "../domains/game-servers/functions";
import { GameServer } from "../domains/game-servers/types";
import { internalMiddleware } from "../middleware/internal";

export const internalRoutes = new Elysia({ prefix: "/internal" })
	.use(internalMiddleware)
	.guard({ requireInternal: true }, (app) =>
		app
			.get("/game-servers", () => list(), {
				detail: { tags: ["Internal"], summary: "List servers (internal)" },
				response: { 200: t.Array(GameServer) },
			})
			.post(
				"/game-servers/:name/sync",
				async ({ params }) => {
					const server = await syncStatus(params.name);
					return server || { error: "Not found" };
				},
				{
					detail: { tags: ["Internal"], summary: "Sync server status" },
					params: t.Object({ name: t.String() }),
				}
			)
			// Webhook endpoint for K8s events (future use)
			.post(
				"/webhooks/k8s",
				({ body }) => {
					logger.info({ body }, "K8s webhook received");
					return { received: true };
				},
				{
					detail: { tags: ["Internal"], summary: "K8s event webhook" },
					body: t.Any(),
				}
			)
	);
