import { Elysia } from "elysia";
import logger from "logger";
import { appRoutes } from "../domains/apps/routes";
import { gameServerRoutes } from "../domains/game-servers/routes";
import { opsRoutes } from "../domains/ops/routes";
import { systemInfoRoutes } from "../domains/system-info/routes";
import { autheliaMiddleware } from "../middleware/authelia";
import { aiRoutes } from "./ai";

export const privateRoutes = new Elysia({ prefix: "/api" })
	.use(autheliaMiddleware)
	.use(appRoutes)
	.use(gameServerRoutes)
	.use(systemInfoRoutes)
	.use(opsRoutes)
	.use(aiRoutes)
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
