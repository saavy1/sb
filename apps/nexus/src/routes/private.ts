import { Elysia } from "elysia";
import logger from "logger";
import { agentRoutes } from "@nexus-core/domains/agent";
import { appRoutes } from "@nexus-core/domains/apps";
import { settingsRoutes } from "@nexus-core/domains/core";
import { gameServerRoutes } from "@nexus-core/domains/game-servers";
import { opsRoutes } from "@nexus-core/domains/ops";
import { systemInfoRoutes } from "@nexus-core/domains/system-info";
import { autheliaMiddleware } from "../middleware/authelia";
import { debugRoutes } from "./debug";
import { eventsRoutes } from "./events";

export const privateRoutes = new Elysia({ prefix: "/api" })
	.use(autheliaMiddleware)
	.use(appRoutes)
	.use(gameServerRoutes)
	.use(systemInfoRoutes)
	.use(opsRoutes)
	.use(agentRoutes)
	.use(settingsRoutes)
	.use(debugRoutes)
	.use(eventsRoutes)
	.onBeforeHandle(({ user, path }) => {
		// In production with Authelia, user will always be set for /api/* routes
		// because Authelia handles auth at the ingress level
		// This is a fallback for direct access or misconfiguration
		if (!user && process.env.NODE_ENV === "production") {
			logger.warn({ path }, "Unauthenticated request to protected route");
			// Don't block - Authelia should handle this at ingress
		}
	})
	.onAfterHandle(({ set }) => {
		// Prevent browser caching of API responses
		set.headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
	});
